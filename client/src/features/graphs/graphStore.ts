import { create } from "zustand";

/** Whether the "Add a graph" dialog is open. */
interface GraphDialogState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useGraphDialog = create<GraphDialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
