import { create } from "zustand";

/**
 * Modifier keys at the last pointer press. Gesture Handler's pan events carry
 * no modifier information, so the web input layer records it here.
 */
export const pointerModifiers = { shift: false };

/** Pointer position over the canvas, for the eraser cursor preview (canvas-relative pixels). */
interface HoverState {
  x: number;
  y: number;
  inside: boolean;
  set: (x: number, y: number) => void;
  leave: () => void;
}

export const useHoverStore = create<HoverState>((set) => ({
  x: 0,
  y: 0,
  inside: false,
  set: (x, y) => set({ x, y, inside: true }),
  leave: () => set({ inside: false }),
}));
