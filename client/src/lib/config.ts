/**
 * Where the page finds the API when EXPO_PUBLIC_API_URL is not set.
 * - Built app (`npm run build:web`), served by the API server itself: the same address the page came from ("" = relative URLs).
 * - Dev server (Metro), which only serves the page: port 8787 on the address the page was opened from, so an iPad that
 *   loaded the app from the laptop's address talks to that laptop and not to itself.
 */
export function defaultApiBase(location: { protocol: string; hostname: string } | undefined, dev: boolean): string {
  if (!location || !location.hostname) return "http://localhost:8787";
  if (!dev) return "";
  return `${location.protocol === "https:" ? "https:" : "http:"}//${location.hostname}:8787`;
}

const isDev = (globalThis as { __DEV__?: boolean }).__DEV__ ?? true;

/** Backend base URL. Only public values belong here; AI keys live on the server. */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? defaultApiBase(typeof window !== "undefined" ? window.location : undefined, isDev);
