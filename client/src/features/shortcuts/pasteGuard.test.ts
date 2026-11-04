import { describe, expect, it } from "vitest";
import { createPasteGuard, PASTE_EVENT_WAIT_MS } from "./pasteGuard";

const copied = { raw: '{"app":"thinkboard"}', text: "ABC" };
const event = (over: Partial<{ raw: string; text: string; hasPicture: boolean }> = {}) => ({ raw: "", text: "", hasPicture: false, ...over });

function clock() {
  let t = 1000;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("one Ctrl+V pastes once", () => {
  it("the browser's event arrives in time: it pastes, and the fallback stays quiet", () => {
    const g = createPasteGuard();
    g.keyPressed();
    expect(g.eventArrived(event({ raw: copied.raw }))).toBe(true);
    expect(g.waitedWithoutEvent(copied)).toBe(false); // the wait ends with nothing left to do
  });

  it("no event comes: the fallback pastes what was last copied", () => {
    const g = createPasteGuard();
    g.keyPressed();
    expect(g.waitedWithoutEvent(copied)).toBe(true);
  });

  it("nothing copied here and no event: nothing to paste", () => {
    const g = createPasteGuard();
    g.keyPressed();
    expect(g.waitedWithoutEvent(null)).toBe(false);
  });

  it("a slow event after the fallback has pasted the same objects is ignored (this was pasting twice)", () => {
    const g = createPasteGuard();
    g.keyPressed();
    expect(g.waitedWithoutEvent(copied)).toBe(true);
    expect(g.eventArrived(event({ raw: copied.raw }))).toBe(false);
  });

  it("a slow event carrying only the same text (our format dropped by the clipboard) is ignored too", () => {
    const g = createPasteGuard();
    g.keyPressed();
    g.waitedWithoutEvent(copied);
    expect(g.eventArrived(event({ text: "ABC" }))).toBe(false);
  });

  it("a slow event with something else on the clipboard is still pasted: other text, other objects, a picture", () => {
    for (const other of [event({ text: "from another app" }), event({ raw: '{"app":"thinkboard","other":1}' }), event({ hasPicture: true })]) {
      const g = createPasteGuard();
      g.keyPressed();
      g.waitedWithoutEvent(copied);
      expect(g.eventArrived(other)).toBe(true);
    }
  });

  it("a later, separate Ctrl+V is a new paste even if it carries the same objects", () => {
    const c = clock();
    const g = createPasteGuard(c.now);
    g.keyPressed();
    g.waitedWithoutEvent(copied);
    c.advance(5000); // long after: not the same key press
    g.keyPressed();
    expect(g.eventArrived(event({ raw: copied.raw }))).toBe(true);
  });

  it("only the first late event is swallowed", () => {
    const g = createPasteGuard();
    g.keyPressed();
    g.waitedWithoutEvent(copied);
    expect(g.eventArrived(event({ raw: copied.raw }))).toBe(false);
    g.keyPressed();
    expect(g.eventArrived(event({ raw: copied.raw }))).toBe(true); // the next Ctrl+V pastes again
  });

  it("an event with no key press before it (the Edit menu, a touch keyboard) just pastes", () => {
    const g = createPasteGuard();
    expect(g.eventArrived(event({ raw: copied.raw }))).toBe(true);
  });

  it("waits long enough for a slow browser", () => {
    expect(PASTE_EVENT_WAIT_MS).toBeGreaterThanOrEqual(250);
  });
});
