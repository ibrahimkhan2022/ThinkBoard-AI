import type { Rect } from "@thinkboard/shared";
import { create } from "zustand";

export interface ActiveAnnotation {
  /** Canvas (world) coordinates. */
  rect: Rect;
  isMock: boolean;
  /** The numbered line this highlight marks, when it came from one. */
  line?: number;
  /** False when this only marks where the popup goes (an answer that did not point at anything): no box is drawn. */
  outline?: boolean;
  /** The tutor answer this highlight belongs to, so the popup beside it can show that answer. */
  messageId?: string;
}

interface AnnotationState {
  /**
   * The AI highlight. Deliberately separate from the whiteboard store: it is
   * never part of the student's objects, undo history or exports.
   */
  annotation: ActiveAnnotation | null;
  /** Whether the answer popup beside the highlight is showing. Closing it leaves the highlight (and the sidebar answer). */
  popupOpen: boolean;
  setAnnotation: (annotation: ActiveAnnotation | null) => void;
  closePopup: () => void;
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  annotation: null,
  popupOpen: true,
  // A new highlight always brings its popup with it.
  setAnnotation: (annotation) => set({ annotation, popupOpen: true }),
  closePopup: () => set({ popupOpen: false }),
}));
