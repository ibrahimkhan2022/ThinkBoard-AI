/** Short unique id; crypto.randomUUID is not available on every React Native runtime. */
export function createId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
