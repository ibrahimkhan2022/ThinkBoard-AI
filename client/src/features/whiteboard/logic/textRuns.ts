/**
 * Character formatting for text objects, stored as spans over the plain text.
 * `text` stays the single source of truth for the characters; `spans` only say
 * which ranges are bold, italic, underlined, superscript or subscript. A range
 * with no span is plain. Every edit goes through the per-character form below,
 * so spans can never overlap, drift or point past the end of the text.
 */
export type TextScript = "sup" | "sub";

export interface TextAttrs {
  b?: true;
  i?: true;
  u?: true;
  script?: TextScript;
}

export interface TextSpan extends TextAttrs {
  /** First character (UTF-16 index) covered. */
  start: number;
  /** One past the last character covered. */
  end: number;
}

/** What the toolbar toggles. */
export type AttrKey = "b" | "i" | "u" | "sup" | "sub";

export const hasAttrs = (a: TextAttrs): boolean => !!(a.b || a.i || a.u || a.script);

export const sameAttrs = (a: TextAttrs, b: TextAttrs): boolean =>
  !!a.b === !!b.b && !!a.i === !!b.i && !!a.u === !!b.u && a.script === b.script;

const clean = (a: TextAttrs): TextAttrs => ({
  ...(a.b ? { b: true as const } : {}),
  ...(a.i ? { i: true as const } : {}),
  ...(a.u ? { u: true as const } : {}),
  ...(a.script === "sup" || a.script === "sub" ? { script: a.script } : {}),
});

/** One attribute set per character; the form every edit works in. */
export function toCharAttrs(spans: readonly TextSpan[] | undefined, length: number): TextAttrs[] {
  const chars: TextAttrs[] = Array.from({ length }, () => ({}));
  for (const span of spans ?? []) {
    const attrs = clean(span);
    for (let i = Math.max(0, span.start); i < Math.min(length, span.end); i++) chars[i] = attrs;
  }
  return chars;
}

/** Merges neighbouring characters with equal formatting into spans; plain characters produce none. */
export function fromCharAttrs(chars: readonly TextAttrs[]): TextSpan[] {
  const spans: TextSpan[] = [];
  let open: TextSpan | null = null;
  chars.forEach((attrs, i) => {
    if (!hasAttrs(attrs)) {
      open = null;
      return;
    }
    if (open && sameAttrs(open, attrs)) {
      open.end = i + 1;
    } else {
      open = { start: i, end: i + 1, ...clean(attrs) };
      spans.push(open);
    }
  });
  return spans;
}

/** Cleans spans from storage or an edit: clipped to the text, ordered, merged, no empty or plain ones. */
export function normalizeSpans(spans: readonly TextSpan[] | undefined, length: number): TextSpan[] {
  return fromCharAttrs(toCharAttrs(spans, length));
}

export function attrsAt(spans: readonly TextSpan[] | undefined, index: number): TextAttrs {
  for (const span of spans ?? []) if (index >= span.start && index < span.end) return clean(span);
  return {};
}

/**
 * Replaces characters [start, end) by `insert` (one attribute set per new
 * character) and returns the spans for the new text.
 */
export function spliceSpans(
  spans: readonly TextSpan[] | undefined,
  length: number,
  start: number,
  end: number,
  insert: readonly TextAttrs[],
): TextSpan[] {
  const chars = toCharAttrs(spans, length);
  chars.splice(start, end - start, ...insert);
  return fromCharAttrs(chars);
}

/** The formatting of [start, end) rebased to start at 0 (what a copy carries). */
export function sliceSpans(spans: readonly TextSpan[] | undefined, length: number, start: number, end: number): TextSpan[] {
  return fromCharAttrs(toCharAttrs(spans, length).slice(start, end));
}

const flag = (a: TextAttrs, key: AttrKey): boolean => (key === "sup" || key === "sub" ? a.script === key : !!a[key]);

/** Whether none, some or every character of [start, end) has the attribute (for the toolbar's pressed state). */
export function rangeState(spans: readonly TextSpan[] | undefined, length: number, start: number, end: number, key: AttrKey): "none" | "some" | "all" {
  if (end <= start) return "none";
  const chars = toCharAttrs(spans, length).slice(start, end);
  const on = chars.filter((a) => flag(a, key)).length;
  return on === 0 ? "none" : on === chars.length ? "all" : "some";
}

/** `attrs` with one attribute switched on or off. Superscript and subscript replace each other. */
export function withAttr(attrs: TextAttrs, key: AttrKey, on: boolean): TextAttrs {
  const next: TextAttrs = { ...attrs };
  if (key === "sup" || key === "sub") {
    if (on) next.script = key;
    else if (next.script === key) delete next.script;
  } else if (on) {
    next[key] = true;
  } else {
    delete next[key];
  }
  return clean(next);
}

/** Switches an attribute on or off for every character of [start, end). */
export function setAttrInRange(
  spans: readonly TextSpan[] | undefined,
  length: number,
  start: number,
  end: number,
  key: AttrKey,
  on: boolean,
): TextSpan[] {
  const chars = toCharAttrs(spans, length);
  for (let i = Math.max(0, start); i < Math.min(length, end); i++) chars[i] = withAttr(chars[i], key, on);
  return fromCharAttrs(chars);
}

/**
 * Formatting for text typed or pasted at [start, end): it continues the
 * character just before the caret (or the first replaced character), the way
 * word processors do, unless the user switched a style on or off at the caret.
 */
export function inheritedAttrs(spans: readonly TextSpan[] | undefined, start: number, end: number): TextAttrs {
  if (end > start) return attrsAt(spans, start);
  return start > 0 ? attrsAt(spans, start - 1) : attrsAt(spans, 0);
}
