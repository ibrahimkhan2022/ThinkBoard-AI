import type { DiagramRequest, MockScenario, Rect, TutorMode, TutorRequest, TutorResult } from "@thinkboard/shared";
import { Image } from "react-native";
import { create } from "zustand";
import { createId } from "../../lib/ids";
import { useAnnotationStore } from "../annotations/annotationStore";
import { resolveAnnotation } from "../annotations/resolveAnnotation";
import { chooseAIRegion, fitMarkerMargin, type AIRegion, type FocusMode } from "../whiteboard/logic/aiRegion";
import { typedLinesOf } from "../whiteboard/logic/typedLines";
import { diagramIsAboutBoard, wantsDiagram } from "./diagramIntent";
import { visibleWorldRect } from "../whiteboard/logic/viewport";
import { placeImage } from "../whiteboard/import/importImage";
import { prepareImage } from "../whiteboard/import/prepareImage";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { ACTION_LABELS, historyFor } from "./chat";
import { MAX_STORED_MESSAGES, type ChatMessage } from "./chatTypes";
import { fetchServerInfo, fetchUsage, requestDiagram, requestTutor, TutorApiError, type ServerInfo, type UsageInfo } from "./tutorApi";

/**
 * Longest edge of the image sent to the AI. Paid models bill by image size
 * (about 1,300-1,500 tokens at this size), so this is a deliberate trade-off
 * between legible handwriting and cost.
 */
export const AI_IMAGE_MAX_DIMENSION = 1280;

interface TutorState {
  sessionId: string;
  /** The conversation for the board that is open. Saved with the board. */
  messages: ChatMessage[];
  loading: boolean;
  /** What the AI looks at when nothing is selected: the student's recent work, or everything on screen. */
  focusMode: FocusMode;
  setFocusMode: (mode: FocusMode) => void;
  /** Outline what the AI will look at (and the numbered lines) on the board while the tutor panel is open. */
  showFocusOnBoard: boolean;
  setShowFocusOnBoard: (show: boolean) => void;
  /** What the backend is serving; null until it has been asked (or if it is unreachable). */
  server: ServerInfo | null;
  /** Estimated spend and limits; only for the paid provider. */
  usage: UsageInfo | null;
  /** The student has confirmed that paid AI will be used in this session. Required before any paid call. */
  paidAcknowledged: boolean;
  acknowledgePaid: () => void;
  refreshUsage: () => Promise<void>;
  mockScenario: MockScenario;
  setMockScenario: (scenario: MockScenario) => void;
  loadServerInfo: () => Promise<void>;
  /** Replaces the conversation (when a board is opened). Clears any highlight from the previous one. */
  loadChat: (messages: ChatMessage[]) => void;
  /** Starts a fresh conversation on this board. */
  newConversation: () => void;
  /** Runs one tutoring action. Only ever called from an explicit user click. */
  ask: (mode: TutorMode, question?: string) => Promise<void>;
  /** Draws a study diagram with Muse Image and puts it on the board. Costs about a cent: only ever called from an explicit click. */
  makeDiagram: (description: string, typedByStudent?: boolean) => Promise<void>;
  /** Runs a failed action again (an explicit click on Retry). */
  retry: (messageId: string) => Promise<void>;
  /** Draws a saved answer's highlight on the board and brings it into view. */
  showOnBoard: (messageId: string) => void;
}

const message = (partial: Omit<ChatMessage, "id" | "createdAt">): ChatMessage => ({ id: createId(), createdAt: Date.now(), ...partial });
const append = (messages: ChatMessage[], ...added: ChatMessage[]) => [...messages, ...added].slice(-MAX_STORED_MESSAGES);

export const useTutorStore = create<TutorState>((set, get) => ({
  sessionId: createId(),
  messages: [],
  loading: false,
  focusMode: "recent",
  setFocusMode: (focusMode) => set({ focusMode }),
  showFocusOnBoard: true,
  setShowFocusOnBoard: (showFocusOnBoard) => set({ showFocusOnBoard }),
  server: null,
  usage: null,
  paidAcknowledged: false,
  acknowledgePaid: () => set({ paidAcknowledged: true }),
  refreshUsage: async () => {
    if (!get().server?.paid) return;
    set({ usage: await fetchUsage(get().sessionId) });
  },
  mockScenario: "distribution_error",
  setMockScenario: (mockScenario) => set({ mockScenario }),

  loadServerInfo: async () => {
    set({ server: await fetchServerInfo() });
    await get().refreshUsage();
  },

  loadChat: (messages) => {
    useAnnotationStore.getState().setAnnotation(null);
    set({ messages, loading: false });
  },

  newConversation: () => {
    useAnnotationStore.getState().setAnnotation(null);
    set({ messages: [], loading: false });
  },

  ask: async (mode, question) => {
    if (get().loading) return;
    const text = question?.trim() || undefined;
    // "Can you draw a diagram of ...": the tutor answers in words, so a request to draw goes to Muse Image instead.
    if (mode === "ask" && text && get().server?.diagrams && wantsDiagram(text)) return get().makeDiagram(text, true);
    const studentTurn = message(
      mode === "ask" && text
        ? { role: "student", kind: "question", text }
        : { role: "student", kind: "action", mode, ...(text ? { text } : {}) },
    );
    // Paid AI is only ever used on an explicit click, and only after the student has agreed to it.
    if (get().server?.paid && !get().paidAcknowledged) {
      set({ messages: append(get().messages, studentTurn, message({ role: "tutor", kind: "error", text: "Please confirm that you want to use the paid AI tutor first." })) });
      return;
    }

    const history = historyFor(get().messages);
    set({ messages: append(get().messages, studentTurn), loading: true });
    useAnnotationStore.getState().setAnnotation(null);

    const fail = (error: string) =>
      set({ messages: append(get().messages, message({ role: "tutor", kind: "error", text: error, retry: { mode, ...(text ? { question: text } : {}) } })), loading: false });

    const board = useWhiteboardStore.getState();
    const picked = chooseAIRegion(board.objects, board.selectedIds, board.viewport, board.canvasSize, get().focusMode);
    if (!picked && mode !== "ask") {
      fail("There is nothing on screen for the tutor to look at. Write or draw something, or zoom out to it.");
      return;
    }

    const ai: AIRegion | null = picked && fitMarkerMargin(picked, AI_IMAGE_MAX_DIMENSION);
    const typed = ai ? typedLinesOf(ai.lines, board.objects) : [];
    const request: TutorRequest = {
      sessionId: get().sessionId,
      mode,
      question: text,
      region: ai?.region ?? fallbackRegion(board.viewport, board.canvasSize),
      ...(ai && ai.lines.length ? { labeledLines: ai.lines.length } : {}),
      ...(ai ? { focus: ai.source } : {}),
      ...(typed.length ? { typedLines: typed } : {}),
      ...(history.length ? { history } : {}),
      mockScenario: get().server?.isMock ? get().mockScenario : undefined,
    };

    let pixels: { width: number; height: number } | undefined;
    if (ai) {
      try {
        // Imported lazily: Skia may only load after CanvasKit has initialised on web.
        const { renderRegion } = await import("../whiteboard/export/renderRegion");
        const image = await renderRegion(board.objects, ai.region, {
          maxDimension: AI_IMAGE_MAX_DIMENSION,
          format: "png",
          markers: ai.lines.map((l) => ({ label: String(l.index), y: l.bounds.y + l.bounds.height / 2 })),
        });
        request.imageBase64 = image.base64;
        request.imageMimeType = image.mimeType;
        pixels = { width: image.width, height: image.height };
      } catch {
        fail("Could not capture your board to send to the tutor. Please try again.");
        return;
      }
    }

    try {
      const result = await requestTutor(request);
      // Map the highlight with the region and lines that were actually sent, not the current viewport.
      const outcome = resolveAnnotation(result.response, request.region, ai?.lines);
      const answerId = createId();
      // An answer that does not point at anything still gets its popup, beside the student's last line (no box drawn).
      const anchor = outcome.kind === "none" && ai ? answerAnchor(ai) : undefined;
      if (outcome.kind === "highlight") {
        useAnnotationStore.getState().setAnnotation({ rect: outcome.rect, isMock: result.meta.isMock, line: outcome.line, messageId: answerId });
      } else if (anchor) {
        useAnnotationStore.getState().setAnnotation({ rect: anchor, isMock: result.meta.isMock, outline: false, messageId: answerId });
      }
      const answer = message({
        role: "tutor",
        kind: "answer",
        mode,
        result,
        focus: { source: ai?.source ?? "none", lineCount: ai?.lines.length ?? 0, pixelWidth: pixels?.width, pixelHeight: pixels?.height },
        ...(outcome.kind === "highlight" ? { highlight: outcome.rect, ...(outcome.line ? { highlightLine: outcome.line } : {}) } : {}),
        ...(anchor ? { anchor } : {}),
      });
      set({ messages: append(get().messages, { ...answer, id: answerId }), loading: false });
    } catch (err) {
      fail(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      void get().refreshUsage(); // a refused or failed call still changes the counts
    }
  },

  makeDiagram: async (description, typedByStudent = false) => {
    const text = description.trim();
    if (get().loading || !text) return;
    const studentTurn = message({ role: "student", kind: "question", text: typedByStudent ? text : `Draw a diagram: ${text}` });
    // Paid AI is only ever used on an explicit click, and only after the student has agreed to it.
    if (get().server?.paid && !get().paidAcknowledged) {
      set({ messages: append(get().messages, studentTurn, message({ role: "tutor", kind: "error", text: "Please confirm that you want to use the paid AI tutor first." })) });
      return;
    }
    set({ messages: append(get().messages, studentTurn), loading: true });
    try {
      const request: DiagramRequest = { sessionId: get().sessionId, description: text.slice(0, 400) };
      // "What this situation looks like": the board is shown to Muse Spark first, so it knows what the situation is.
      if (diagramIsAboutBoard(text)) {
        const board = useWhiteboardStore.getState();
        const picked = chooseAIRegion(board.objects, board.selectedIds, board.viewport, board.canvasSize, get().focusMode);
        const ai = picked && fitMarkerMargin(picked, AI_IMAGE_MAX_DIMENSION);
        if (ai) {
          const { renderRegion } = await import("../whiteboard/export/renderRegion");
          const image = await renderRegion(board.objects, ai.region, {
            maxDimension: AI_IMAGE_MAX_DIMENSION,
            format: "png",
            markers: ai.lines.map((l) => ({ label: String(l.index), y: l.bounds.y + l.bounds.height / 2 })),
          });
          const typed = typedLinesOf(ai.lines, board.objects);
          request.imageBase64 = image.base64;
          request.imageMimeType = image.mimeType;
          if (typed.length) request.typedLines = typed;
        }
      }
      const result = await requestDiagram(request);
      const uri = `data:${result.imageMimeType};base64,${result.imageBase64}`;
      const size = await new Promise<{ width: number; height: number }>((resolve, reject) => Image.getSize(uri, (width, height) => resolve({ width, height }), reject));
      placeImage(await prepareImage(uri, size.width, size.height));
      const shown = result.brief ? `I drew this on your board: ${result.brief}` : `I drew \u201c${text}\u201d on your board.`;
      set({
        messages: append(get().messages, message({ role: "tutor", kind: "notice", text: `${shown} Move or resize it, add to it, or ask me about it.` })),
        loading: false,
      });
    } catch (err) {
      const reason = err instanceof TutorApiError ? err.message : "Something went wrong while drawing the diagram.";
      set({ messages: append(get().messages, message({ role: "tutor", kind: "error", text: reason })), loading: false });
    } finally {
      void get().refreshUsage();
    }
  },

  retry: async (messageId) => {
    const failed = get().messages.find((m) => m.id === messageId);
    if (!failed?.retry || get().loading) return;
    // The failed turn is replaced by the new attempt rather than piling up.
    set({ messages: get().messages.filter((m) => m.id !== messageId) });
    await get().ask(failed.retry.mode, failed.retry.question);
  },

  showOnBoard: (messageId) => {
    const found = get().messages.find((m) => m.id === messageId);
    const rect = found?.highlight ?? found?.anchor;
    if (!found || !rect) return;
    useAnnotationStore.getState().setAnnotation({ rect, isMock: found.result?.meta.isMock ?? false, line: found.highlightLine, messageId: found.id, ...(found.highlight ? {} : { outline: false }) });
    useWhiteboardStore.getState().revealRect(rect);
  },
}));

/** Where an answer's popup goes when nothing was highlighted: the student's last numbered line, else what the AI looked at. */
function answerAnchor(ai: AIRegion): Rect {
  const last = ai.lines[ai.lines.length - 1];
  if (!last) return ai.region;
  const p = 10;
  return { x: last.bounds.x - p, y: last.bounds.y - p, width: last.bounds.width + p * 2, height: last.bounds.height + p * 2 };
}

function fallbackRegion(viewport: Parameters<typeof visibleWorldRect>[0], size: { width: number; height: number }): Rect {
  const visible = visibleWorldRect(viewport, size);
  return { x: visible.x, y: visible.y, width: Math.max(1, visible.width), height: Math.max(1, visible.height) };
}

export type { TutorResult };
export { ACTION_LABELS };
