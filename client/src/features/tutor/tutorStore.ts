import type { MockScenario, Rect, TutorMode, TutorRequest, TutorResult } from "@thinkboard/shared";
import { create } from "zustand";
import { createId } from "../../lib/ids";
import { useAnnotationStore } from "../annotations/annotationStore";
import { resolveAnnotation } from "../annotations/resolveAnnotation";
import { chooseAIRegion, fitMarkerMargin, type AIRegion, type FocusMode } from "../whiteboard/logic/aiRegion";
import { visibleWorldRect } from "../whiteboard/logic/viewport";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { ACTION_LABELS, historyFor } from "./chat";
import { MAX_STORED_MESSAGES, type ChatMessage } from "./chatTypes";
import { fetchServerInfo, fetchUsage, requestTutor, type ServerInfo, type UsageInfo } from "./tutorApi";

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
    const request: TutorRequest = {
      sessionId: get().sessionId,
      mode,
      question: text,
      region: ai?.region ?? fallbackRegion(board.viewport, board.canvasSize),
      ...(ai && ai.lines.length ? { labeledLines: ai.lines.length } : {}),
      ...(ai ? { focus: ai.source } : {}),
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
      if (outcome.kind === "highlight") {
        useAnnotationStore.getState().setAnnotation({ rect: outcome.rect, isMock: result.meta.isMock, line: outcome.line });
      }
      const answer = message({
        role: "tutor",
        kind: "answer",
        mode,
        result,
        focus: { source: ai?.source ?? "none", lineCount: ai?.lines.length ?? 0, pixelWidth: pixels?.width, pixelHeight: pixels?.height },
        ...(outcome.kind === "highlight" ? { highlight: outcome.rect, ...(outcome.line ? { highlightLine: outcome.line } : {}) } : {}),
      });
      set({ messages: append(get().messages, answer), loading: false });
    } catch (err) {
      fail(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      void get().refreshUsage(); // a refused or failed call still changes the counts
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
    if (!found?.highlight) return;
    useAnnotationStore.getState().setAnnotation({ rect: found.highlight, isMock: found.result?.meta.isMock ?? false, line: found.highlightLine });
    useWhiteboardStore.getState().revealRect(found.highlight);
  },
}));

function fallbackRegion(viewport: Parameters<typeof visibleWorldRect>[0], size: { width: number; height: number }): Rect {
  const visible = visibleWorldRect(viewport, size);
  return { x: visible.x, y: visible.y, width: Math.max(1, visible.width), height: Math.max(1, visible.height) };
}

export type { TutorResult };
export { ACTION_LABELS };
