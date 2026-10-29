/**
 * Tiny preference store: localStorage on the web, a no-op elsewhere. Every
 * access is wrapped because storage can be missing, full, or blocked (private
 * windows), and preferences must never be able to break the app.
 */
export function readStored<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not saving a preference is harmless.
  }
}
