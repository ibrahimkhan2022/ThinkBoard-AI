import { readStored, writeStored } from "../../../lib/localStore";
import { ALL_SYMBOLS } from "./mathSymbols";

const KEY = "thinkboard.symbols.v1";
export const MAX_RECENT_SYMBOLS = 14;

/** `symbol` moved (or added) to the front, with no repeats, keeping the newest `max`. */
export function addRecentSymbol(recent: string[], symbol: string, max = MAX_RECENT_SYMBOLS): string[] {
  return [symbol, ...recent.filter((c) => c !== symbol)].slice(0, max);
}

/** Saved symbols that are still in the keyboard, once each; anything else in storage is ignored. */
export function sanitizeRecentSymbols(raw: unknown, max = MAX_RECENT_SYMBOLS): string[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set(ALL_SYMBOLS.map((e) => e.c));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of raw) {
    if (typeof c !== "string" || !known.has(c) || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
    if (out.length === max) break;
  }
  return out;
}

export const loadRecentSymbols = (): string[] => sanitizeRecentSymbols(readStored<unknown>(KEY, []));
export const saveRecentSymbols = (recent: string[]) => writeStored(KEY, recent);
