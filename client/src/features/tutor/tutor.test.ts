import type { Rect, TutorResponse, TutorResult } from "@thinkboard/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { createBoard, sanitizeDoc } from "../boards/boardDoc";
import { LINE_HIGHLIGHT_PADDING, resolveAnnotation } from "../annotations/resolveAnnotation";
import { chooseAIRegion, fitMarkerMargin, LINE_MARKER_MARGIN } from "../whiteboard/logic/aiRegion";
import { groupIntoLines } from "../whiteboard/logic/workLines";
import type { StrokeObject } from "../whiteboard/types";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { historyFor, sanitizeChat } from "./chat";
import type { ChatMessage } from "./chatTypes";

const result = (message: string, overrides: Partial<TutorResponse> = {}): TutorResult => ({
  response: { status: "error_found", message, revealAnswer: false, ...overrides },
  meta: { provider: "mock", isMock: true },
});

const msg = (overrides: Partial<ChatMessage> & Pick<ChatMessage, "id" | "role" | "kind">): ChatMessage => ({ createdAt: 1, ...overrides });

describe("historyFor", () => {
  it("sends action labels, questions and the text of answers, oldest first", () => {
    const history = historyFor([
      msg({ id: "1", role: "student", kind: "action", mode: "check_work" }),
      msg({ id: "2", role: "tutor", kind: "answer", result: result("Look at `5x − 10`.") }),
      msg({ id: "3", role: "student", kind: "question", mode: "ask", text: "why?" }),
    ]);
    expect(history).toEqual([
      { role: "student", text: "Check my work" },
      { role: "tutor", text: "Look at 5x − 10." },
      { role: "student", text: "why?" },
    ]);
  });

  it("leaves out errors and notices, and keeps only the last six turns", () => {
    const many: ChatMessage[] = Array.from({ length: 10 }, (_, i) => msg({ id: `q${i}`, role: "student", kind: "question", mode: "ask", text: `q${i}` }));
    many.splice(3, 0, msg({ id: "e", role: "tutor", kind: "error", text: "failed" }));
    const history = historyFor(many);
    expect(history).toHaveLength(6);
    expect(history[0].text).toBe("q4");
    expect(history.some((h) => h.text === "failed")).toBe(false);
  });
});

describe("sanitizeChat", () => {
  it("round-trips valid messages", () => {
    const original: ChatMessage[] = [
      msg({ id: "a", role: "student", kind: "action", mode: "hint" }),
      msg({ id: "b", role: "tutor", kind: "answer", result: result("ok"), highlight: { x: 1, y: 2, width: 3, height: 4 }, highlightLine: 2, focus: { source: "recent", lineCount: 3 } }),
    ];
    expect(sanitizeChat(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });

  it("drops damaged entries instead of failing", () => {
    const cleaned = sanitizeChat([
      null,
      { id: 1 },
      { id: "x", role: "robot", kind: "answer" },
      { id: "y", role: "tutor", kind: "answer", result: { nope: true } },
      { id: "z", role: "student", kind: "question", text: "kept", mode: "ask" },
    ]);
    expect(cleaned.map((m) => m.id)).toEqual(["z"]);
    expect(sanitizeChat("garbage")).toEqual([]);
  });

  it("ignores a highlight with no size", () => {
    const [m] = sanitizeChat([{ id: "a", role: "student", kind: "notice", highlight: { x: 0, y: 0, width: 0, height: 5 } }]);
    expect(m.highlight).toBeUndefined();
  });

  it("caps how many messages are kept", () => {
    const raw = Array.from({ length: 500 }, (_, i) => ({ id: `m${i}`, role: "student", kind: "notice", text: "x" }));
    expect(sanitizeChat(raw).length).toBeLessThanOrEqual(200);
    expect(sanitizeChat(raw).at(-1)?.id).toBe("m499");
  });
});

describe("board documents keep the conversation", () => {
  it("new boards start with an empty chat", () => {
    expect(createBoard(1).chat).toEqual([]);
  });

  it("sanitizeDoc restores chat and tolerates older boards without it", () => {
    const board = createBoard(1);
    const chat = [msg({ id: "a", role: "student", kind: "question", mode: "ask", text: "hi" })];
    expect(sanitizeDoc({ ...board, chat })?.chat).toEqual(chat);
    const { chat: _drop, ...older } = board;
    expect(sanitizeDoc(older)?.chat).toEqual([]);
  });
});

describe("resolveAnnotation with numbered lines", () => {
  const region: Rect = { x: 0, y: 0, width: 1000, height: 1000 };
  const lines = [
    { index: 1, bounds: { x: 100, y: 100, width: 300, height: 40 }, objectIds: ["a"] },
    { index: 2, bounds: { x: 100, y: 200, width: 300, height: 40 }, objectIds: ["b"] },
  ];
  const base: TutorResponse = { status: "error_found", message: "m", confidence: 0.9, errorStep: 2, revealAnswer: false };

  it("highlights the student's own line, padded, without needing a model box", () => {
    const outcome = resolveAnnotation(base, region, lines);
    expect(outcome).toEqual({
      kind: "highlight",
      line: 2,
      rect: { x: 100 - LINE_HIGHLIGHT_PADDING, y: 200 - LINE_HIGHLIGHT_PADDING, width: 300 + LINE_HIGHLIGHT_PADDING * 2, height: 40 + LINE_HIGHLIGHT_PADDING * 2 },
    });
  });

  it("prefers the line over the model's box", () => {
    const outcome = resolveAnnotation({ ...base, highlight: { xMin: 0, yMin: 0, xMax: 100, yMax: 100 } }, region, lines);
    expect(outcome.kind === "highlight" && outcome.line).toBe(2);
  });

  it("falls back to the model's box when the line number is unknown", () => {
    const outcome = resolveAnnotation({ ...base, errorStep: 9, highlight: { xMin: 0, yMin: 0, xMax: 500, yMax: 500 } }, region, lines);
    expect(outcome.kind === "highlight" && outcome.line).toBeFalsy();
    expect(outcome.kind).toBe("highlight");
  });

  it("still shows text only when confidence is low or the work is correct", () => {
    expect(resolveAnnotation({ ...base, confidence: 0.3 }, region, lines)).toEqual({ kind: "none", reason: "low_confidence" });
    expect(resolveAnnotation({ ...base, confidence: undefined }, region, lines)).toEqual({ kind: "none", reason: "low_confidence" });
    expect(resolveAnnotation({ ...base, status: "correct" }, region, lines)).toEqual({ kind: "none", reason: "not_applicable" });
    expect(resolveAnnotation({ ...base, errorStep: undefined }, region, lines)).toEqual({ kind: "none", reason: "no_highlight" });
  });
});

describe("fitMarkerMargin", () => {
  const line = (id: string, y: number): StrokeObject => ({
    id,
    kind: "stroke",
    color: "#000",
    width: 4,
    points: [
      { x: 200, y },
      { x: 500, y: y + 30 },
    ],
  });

  it("leaves room for the badges when the board is exported small", () => {
    const objects = [line("a", 100), line("b", 200)];
    const ai = chooseAIRegion(objects, [], { x: 0, y: 0, scale: 1 }, { width: 1200, height: 800 }, "screen")!;
    const fitted = fitMarkerMargin(ai, 400);
    expect(ai.contentLeft - fitted.region.x).toBeGreaterThanOrEqual(LINE_MARKER_MARGIN - 1);
    expect(fitted.region.x).toBeLessThanOrEqual(ai.region.x);
  });

  it("does nothing when there is no work to label", () => {
    const ai = { region: { x: 0, y: 0, width: 100, height: 100 }, source: "view" as const, lines: [], contentLeft: 0 };
    expect(fitMarkerMargin(ai, 400)).toBe(ai);
  });
});

describe("focus on recent work", () => {
  it("leaves a faraway earlier problem out of the region", () => {
    const old: StrokeObject = { id: "old", kind: "stroke", color: "#000", width: 4, points: [{ x: 100, y: 100 }, { x: 400, y: 140 }] };
    const now: StrokeObject = { id: "new", kind: "stroke", color: "#000", width: 4, points: [{ x: 100, y: 1500 }, { x: 400, y: 1540 }] };
    const ai = chooseAIRegion([old, now], [], { x: 0, y: -50, scale: 0.4 }, { width: 1000, height: 800 }, "recent")!;
    expect(ai.source).toBe("recent");
    expect(ai.lines).toHaveLength(1);
    expect(ai.region.y).toBeGreaterThan(1000);
    expect(groupIntoLines([old, now])).toHaveLength(2);
  });
});

describe("revealRect", () => {
  const initial = useWhiteboardStore.getState();
  beforeEach(() => {
    useWhiteboardStore.setState(initial, true);
    useWhiteboardStore.getState().setCanvasSize(1000, 800);
  });

  it("leaves the view alone when the rectangle is already comfortably visible", () => {
    const before = useWhiteboardStore.getState().viewport;
    useWhiteboardStore.getState().revealRect({ x: 300, y: 300, width: 200, height: 100 });
    expect(useWhiteboardStore.getState().viewport).toEqual(before);
  });

  it("pans to centre an offscreen rectangle without changing zoom", () => {
    useWhiteboardStore.getState().revealRect({ x: 3000, y: 2000, width: 200, height: 100 });
    const { viewport } = useWhiteboardStore.getState();
    expect(viewport.scale).toBe(initial.viewport.scale);
    expect(3100 * viewport.scale + viewport.x).toBeCloseTo(500);
    expect(2050 * viewport.scale + viewport.y).toBeCloseTo(400);
  });

  it("zooms out when the rectangle is too big for the screen", () => {
    useWhiteboardStore.getState().revealRect({ x: 0, y: 0, width: 5000, height: 3000 });
    expect(useWhiteboardStore.getState().viewport.scale).toBeLessThan(initial.viewport.scale);
  });
});
