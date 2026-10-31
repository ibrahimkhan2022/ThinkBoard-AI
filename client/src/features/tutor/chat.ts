import { TutorResultSchema, type HistoryItem, type TutorMode } from "@thinkboard/shared";
import { MAX_STORED_MESSAGES, type ChatMessage } from "./chatTypes";

/** Words shown for each action button in the conversation. */
export const ACTION_LABELS: Record<Exclude<TutorMode, "ask">, string> = {
  check_work: "Check my work",
  hint: "Give me a hint",
  start: "Show me how to start",
  next_step: "Suggest the next step",
  explain_step: "Explain this step",
};

const HISTORY_TURNS = 6;
const stripChips = (s: string) => s.replace(/`/g, "");

/**
 * The last few turns as short text for the model, oldest first. Errors and
 * notices are left out. Answers are reduced to their message so a long answer
 * does not inflate every later request.
 */
export function historyFor(messages: ChatMessage[]): HistoryItem[] {
  const items: HistoryItem[] = [];
  for (const m of messages) {
    if (m.kind === "action" && m.mode && m.mode !== "ask") {
      items.push({ role: "student", text: ACTION_LABELS[m.mode] });
    } else if (m.kind === "question" && m.text) {
      items.push({ role: "student", text: m.text.slice(0, 600) });
    } else if (m.kind === "answer" && m.result) {
      items.push({ role: "tutor", text: stripChips(m.result.response.message).slice(0, 600) });
    }
  }
  return items.slice(-HISTORY_TURNS);
}

const ROLES = new Set(["student", "tutor"]);
const KINDS = new Set(["action", "question", "answer", "error", "notice"]);
const MODES = new Set(["ask", "check_work", "hint", "start", "next_step", "explain_step"]);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Rebuilds saved messages, dropping anything damaged or from an older format instead of failing to open the board. */
export function sanitizeChat(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const m of raw) {
    if (!isRecord(m) || typeof m.id !== "string" || !ROLES.has(m.role as string) || !KINDS.has(m.kind as string)) continue;
    const message: ChatMessage = {
      id: m.id,
      role: m.role as ChatMessage["role"],
      kind: m.kind as ChatMessage["kind"],
      createdAt: finite(m.createdAt) ? m.createdAt : Date.now(),
    };
    if (typeof m.text === "string") message.text = m.text.slice(0, 2000);
    if (typeof m.mode === "string" && MODES.has(m.mode)) message.mode = m.mode as ChatMessage["mode"];
    if (message.kind === "answer") {
      const parsed = TutorResultSchema.safeParse(m.result);
      if (!parsed.success) continue; // an answer without a valid result cannot be shown
      message.result = parsed.data;
    }
    if (isRecord(m.focus) && typeof m.focus.source === "string" && finite(m.focus.lineCount)) {
      message.focus = {
        source: m.focus.source as NonNullable<ChatMessage["focus"]>["source"],
        lineCount: m.focus.lineCount,
        ...(finite(m.focus.pixelWidth) ? { pixelWidth: m.focus.pixelWidth } : {}),
        ...(finite(m.focus.pixelHeight) ? { pixelHeight: m.focus.pixelHeight } : {}),
      };
    }
    const h = m.highlight;
    if (isRecord(h) && finite(h.x) && finite(h.y) && finite(h.width) && finite(h.height) && h.width > 0 && h.height > 0) {
      message.highlight = { x: h.x, y: h.y, width: h.width, height: h.height };
      if (finite(m.highlightLine)) message.highlightLine = m.highlightLine;
    }
    if (isRecord(m.retry) && typeof m.retry.mode === "string" && MODES.has(m.retry.mode)) {
      message.retry = { mode: m.retry.mode as TutorMode, ...(typeof m.retry.question === "string" ? { question: m.retry.question } : {}) };
    }
    out.push(message);
  }
  return out.slice(-MAX_STORED_MESSAGES);
}
