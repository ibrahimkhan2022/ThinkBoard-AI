import type { Rect } from "@thinkboard/shared";
import { create } from "zustand";

export interface ActiveAnnotation {
  /** Canvas (world) coordinates. */
  rect: Rect;
  isMock: boolean;
  /** The numbered line this highlight marks, when it came from one. */
  line?: number;
}

interface AnnotationState {
  /**
   * The AI highlight. Deliberately separate from the whiteboard store: it is
   * never part of the student's objects, undo history or exports.
   */
  annotation: ActiveAnnotation | null;
  setAnnotation: (annotation: ActiveAnnotation | null) => void;
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  annotation: null,
  setAnnotation: (annotation) => set({ annotation }),
}));
