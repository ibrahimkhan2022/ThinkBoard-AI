import { create } from "zustand";
import { readStored, writeStored } from "../../lib/localStore";

export const AI_PANEL_MIN_WIDTH = 280;
export const AI_PANEL_MAX_WIDTH = 480;
export const AI_PANEL_DEFAULT_WIDTH = 340;
/** At and above this window width the AI panel docks beside the board; below it is a drawer. */
export const WIDE_BREAKPOINT = 900;

const KEY = "thinkboard.ui.v1";
export const clampPanelWidth = (w: number) =>
  Math.min(AI_PANEL_MAX_WIDTH, Math.max(AI_PANEL_MIN_WIDTH, Math.round(w)));

interface Saved {
  aiPanelWidth?: number;
  aiPanelOpen?: boolean;
}

interface UiState {
  /** Docked panel on wide screens; remembered between visits. */
  aiPanelOpen: boolean;
  /** Drawer on narrow screens; always starts closed so the board keeps the whole screen. */
  drawerOpen: boolean;
  aiPanelWidth: number;
  /** Opens or closes whichever form of the panel the current screen uses. */
  toggleAi: (isWide: boolean) => void;
  setAiOpen: (isWide: boolean, open: boolean) => void;
  setAiPanelWidth: (width: number) => void;
}

const saved = readStored<Saved>(KEY, {});

export const useUiStore = create<UiState>((set, get) => ({
  aiPanelOpen: typeof saved.aiPanelOpen === "boolean" ? saved.aiPanelOpen : true,
  drawerOpen: false,
  aiPanelWidth: clampPanelWidth(saved.aiPanelWidth ?? AI_PANEL_DEFAULT_WIDTH),
  toggleAi: (isWide) => (isWide ? set({ aiPanelOpen: !get().aiPanelOpen }) : set({ drawerOpen: !get().drawerOpen })),
  setAiOpen: (isWide, open) => (isWide ? set({ aiPanelOpen: open }) : set({ drawerOpen: open })),
  setAiPanelWidth: (width) => set({ aiPanelWidth: clampPanelWidth(width) }),
}));

useUiStore.subscribe((s) => writeStored(KEY, { aiPanelWidth: s.aiPanelWidth, aiPanelOpen: s.aiPanelOpen }));
