import type { MockScenario, Rect, TutorMode, TutorRequest, TutorResult } from "@thinkboard/shared";
import { create } from "zustand";
import { createId } from "../../lib/ids";
import { useAnnotationStore } from "../annotations/annotationStore";
import { resolveAnnotation, type AnnotationOutcome } from "../annotations/resolveAnnotation";
import { chooseAIRegion, type AIRegion } from "../whiteboard/logic/aiRegion";
import { visibleWorldRect } from "../whiteboard/logic/viewport";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { fetchIsMock, requestTutor } from "./tutorApi";

/** Longest edge of the image sent to the AI: large enough for handwriting, small enough to stay cheap. */
export const AI_IMAGE_MAX_DIMENSION = 1568;

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
  /** Null until the backend has been asked. Scenario choice only applies to the mock provider. */
  serverIsMock: boolean | null;
  mockScenario: MockScenario;
  setMockScenario: (scenario: MockScenario) => void;
  loadServerInfo: () => Promise<void>;
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
  serverIsMock: null,
  mockScenario: "distribution_error",
  setMockScenario: (mockScenario) => set({ mockScenario }),

  loadServerInfo: async () => {
    set({ serverIsMock: await fetchIsMock() });
  },

  ask: async (mode, question) => {
    if (get().status === "loading") return;
    set({ status: "loading", error: null, outcome: null });
    useAnnotationStore.getState().setAnnotation(null);

    const board = useWhiteboardStore.getState();
    const picked = chooseAIRegion(board.objects, board.selectedId, board.viewport, board.canvasSize);
    if (!picked && mode !== "ask") {
      set(fail("There is nothing on screen for the tutor to look at. Write or draw something, or zoom out to it."));
      return;
    }

    const request: TutorRequest = {
      sessionId: get().sessionId,
      mode,
      question: question?.trim() || undefined,
      region: picked?.region ?? fallbackRegion(board.viewport, board.canvasSize),
      mockScenario: get().serverIsMock ? get().mockScenario : undefined,
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
    }
  },
}));

function fallbackRegion(viewport: Parameters<typeof visibleWorldRect>[0], size: { width: number; height: number }): Rect {
  const visible = visibleWorldRect(viewport, size);
  return { x: visible.x, y: visible.y, width: Math.max(1, visible.width), height: Math.max(1, visible.height) };
}
