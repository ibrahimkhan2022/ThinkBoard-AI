import { useEffect } from "react";
import { create } from "zustand";

/**
 * One slot for every dismissible popover or menu, so at most one is open at a
 * time: opening one replaces the previous. Modal dialogs report themselves with
 * `useModalGuard`; while any is open, global shortcuts stand down and popovers
 * are closed.
 */
interface OverlayState {
  active: string | null;
  modalDepth: number;
  open: (id: string) => void;
  toggle: (id: string) => void;
  close: (id?: string) => void;
  enterModal: () => void;
  exitModal: () => void;
}

export const useOverlayStore = create<OverlayState>((set, get) => ({
  active: null,
  modalDepth: 0,
  open: (id) => set({ active: id }),
  toggle: (id) => set({ active: get().active === id ? null : id }),
  // With an id, closes only if that overlay is the open one.
  close: (id) => set((s) => (id === undefined || s.active === id ? { active: null } : s)),
  enterModal: () => set((s) => ({ modalDepth: s.modalDepth + 1, active: null })),
  exitModal: () => set((s) => ({ modalDepth: Math.max(0, s.modalDepth - 1) })),
}));

/** Call from a dialog component with its visibility. */
export function useModalGuard(visible: boolean) {
  useEffect(() => {
    if (!visible) return;
    useOverlayStore.getState().enterModal();
    return () => useOverlayStore.getState().exitModal();
  }, [visible]);
}

export const TOOL_SETTINGS_OVERLAY = "tool-settings";
export const BACKGROUND_OVERLAY = "background-menu";
