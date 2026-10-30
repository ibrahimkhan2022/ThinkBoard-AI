import type { MockScenario, Rect, TutorMode, TutorRequest, TutorResult } from "@thinkboard/shared";
import { create } from "zustand";
import { createId } from "../../lib/ids";
import { useAnnotationStore } from "../annotations/annotationStore";
import { resolveAnnotation, type AnnotationOutcome } from "../annotations/resolveAnnotation";
import { chooseAIRegion, type AIRegion } from "../whiteboard/logic/aiRegion";
import { visibleWorldRect } from "../whiteboard/logic/viewport";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { fetchServerInfo, fetchUsage, requestTutor, type ServerInfo, type UsageInfo } from "./tutorApi";

/**
 * Longest edge of the image sent to the AI. Paid models bill by image size
 * (about 1,300-1,500 tokens at this size), so this is a deliberate trade-off
 * between legible handwriting and cost.
 */
export const AI_IMAGE_MAX_DIMENSION = 1280;

export interface CaptureInfo {
  source: AIRegion["source"] | "none";
  pixelWidth?: number;
  pixelHeight?: number;
}

interface TutorState {
  sessionId: string;
  status: "idle" | "loading" | "success" | "error";
  result: TutorResult | null;
  error: string | null;
  /** What was sent with the last request (nothing is sent for a question with no board content). */
  capture: CaptureInfo | null;
  /** Whether the last response was drawn on the board, and why not if it was not. */
  outcome: AnnotationOutcome | null;
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
  /** Forgets the last answer, e.g. when another board is opened. */
  reset: () => void;
  /** Runs one tutoring action. Only ever called from an explicit user click. */
  ask: (mode: TutorMode, question?: string) => Promise<void>;
}

const fail = (message: string) => ({ status: "error" as const, error: message, result: null, outcome: null });

export const useTutorStore = create<TutorState>((set, get) => ({
  sessionId: createId(),
  status: "idle",
  result: null,
  error: null,
  capture: null,
  outcome: null,
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

  reset: () => set({ status: "idle", result: null, error: null, capture: null, outcome: null }),

  loadServerInfo: async () => {
    set({ server: await fetchServerInfo() });
    await get().refreshUsage();
  },

  ask: async (mode, question) => {
    if (get().status === "loading") return;
    // Paid AI is only ever used on an explicit click, and only after the student has agreed to it.
    if (get().server?.paid && !get().paidAcknowledged) {
      set(fail("Please confirm that you want to use the paid AI tutor first."));
      return;
    }
    set({ status: "loading", error: null, outcome: null });
    useAnnotationStore.getState().setAnnotation(null);

    const board = useWhiteboardStore.getState();
    const picked = chooseAIRegion(board.objects, board.selectedIds, board.viewport, board.canvasSize);
    if (!picked && mode !== "ask") {
      set(fail("There is nothing on screen for the tutor to look at. Write or draw something, or zoom out to it."));
      return;
    }

    const request: TutorRequest = {
      sessionId: get().sessionId,
      mode,
      question: question?.trim() || undefined,
      region: picked?.region ?? fallbackRegion(board.viewport, board.canvasSize),
      mockScenario: get().server?.isMock ? get().mockScenario : undefined,
    };

    let capture: CaptureInfo = { source: "none" };
    if (picked) {
      try {
        // Imported lazily: Skia may only load after CanvasKit has initialised on web.
        const { renderRegion } = await import("../whiteboard/export/renderRegion");
        const image = await renderRegion(board.objects, picked.region, {
          maxDimension: AI_IMAGE_MAX_DIMENSION,
          format: "png",
        });
        request.imageBase64 = image.base64;
        request.imageMimeType = image.mimeType;
        capture = { source: picked.source, pixelWidth: image.width, pixelHeight: image.height };
      } catch {
        set(fail("Could not capture your board to send to the tutor. Please try again."));
        return;
      }
    }

    try {
      const result = await requestTutor(request);
      // Map the highlight with the region that was actually sent, not the current viewport.
      const outcome = resolveAnnotation(result.response, request.region);
      useAnnotationStore
        .getState()
        .setAnnotation(outcome.kind === "highlight" ? { rect: outcome.rect, isMock: result.meta.isMock } : null);
      set({ status: "success", result, capture, outcome });
    } catch (err) {
      set(fail(err instanceof Error ? err.message : "Something went wrong."));
    } finally {
      void get().refreshUsage(); // a refused or failed call still changes the counts
    }
  },
}));

function fallbackRegion(viewport: Parameters<typeof visibleWorldRect>[0], size: { width: number; height: number }): Rect {
  const visible = visibleWorldRect(viewport, size);
  return { x: visible.x, y: visible.y, width: Math.max(1, visible.width), height: Math.max(1, visible.height) };
}
