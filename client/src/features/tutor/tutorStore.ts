import type { TutorMode, TutorResult } from "@thinkboard/shared";
import { create } from "zustand";
import { createId } from "../../lib/ids";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { requestTutor } from "./tutorApi";

interface TutorState {
  sessionId: string;
  status: "idle" | "loading" | "success" | "error";
  result: TutorResult | null;
  error: string | null;
  /** Runs one tutoring action. Only ever called from an explicit user click. */
  ask: (mode: TutorMode, question?: string) => Promise<void>;
}

export const useTutorStore = create<TutorState>((set, get) => ({
  sessionId: createId(),
  status: "idle",
  result: null,
  error: null,

  ask: async (mode, question) => {
    if (get().status === "loading") return;
    set({ status: "loading", error: null });

    const { width, height } = useWhiteboardStore.getState().canvasSize;
    try {
      const result = await requestTutor({
        sessionId: get().sessionId,
        mode,
        question: question?.trim() || undefined,
        region: { x: 0, y: 0, width, height },
      });
      set({ status: "success", result });
    } catch (err) {
      set({ status: "error", error: err instanceof Error ? err.message : "Something went wrong." });
    }
  },
}));
