import type { Rect, TutorMode, TutorResult } from "@thinkboard/shared";

/** What the AI was shown for one answer, so the student can see what it was looking at. */
export interface FocusInfo {
  source: "selection" | "recent" | "view" | "none";
  lineCount: number;
  pixelWidth?: number;
  pixelHeight?: number;
}

/**
 * One entry of the tutor conversation. A board keeps its own conversation, saved with it.
 * - student/action: a button the student pressed (`mode`)
 * - student/question: free text the student typed
 * - tutor/answer: a model (or mock) answer, kept whole so it can be shown again
 * - tutor/error: something went wrong; `retry` says what to run again
 * - tutor/notice: a message from the app itself (e.g. a new conversation started)
 */
export interface ChatMessage {
  id: string;
  role: "student" | "tutor";
  kind: "action" | "question" | "answer" | "error" | "notice";
  createdAt: number;
  text?: string;
  mode?: TutorMode;
  result?: TutorResult;
  focus?: FocusInfo;
  /** Where this answer pointed on the board (canvas units), so "Show on board" works after a reload. */
  highlight?: Rect;
  /** For an answer that did not highlight anything: where its popup goes (the student's last line), in canvas units. */
  anchor?: Rect;
  /** The numbered line the highlight comes from, if it came from one. */
  highlightLine?: number;
  retry?: { mode: TutorMode; question?: string };
}

export const MAX_STORED_MESSAGES = 200;
