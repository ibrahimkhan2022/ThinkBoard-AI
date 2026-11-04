import { create } from "zustand";
import type { GraphSource } from "./graphForm";

/** A graph already on the board that the dialog is editing. */
export interface EditingGraph {
  id: string;
  source: GraphSource;
}

/** Whether the graph dialog is open, and which graph on the board (if any) it is editing. */
interface GraphDialogState {
  open: boolean;
  editing: EditingGraph | null;
  /** Opens it to make a new graph. */
  show: () => void;
  /** Opens it filled in with an existing graph; "Update" replaces that graph's picture. */
  edit: (id: string, source: GraphSource) => void;
  hide: () => void;
}

export const useGraphDialog = create<GraphDialogState>((set) => ({
  open: false,
  editing: null,
  show: () => set({ open: true, editing: null }),
  edit: (id, source) => set({ open: true, editing: { id, source } }),
  hide: () => set({ open: false, editing: null }),
}));
