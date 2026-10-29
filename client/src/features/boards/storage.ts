import { createMemoryStorage } from "./memoryStorage";

/**
 * Native platforms do not have a persistent board store yet, so boards live in
 * memory there. The web build uses IndexedDB (see storage.web.ts).
 */
export const boardStorage = createMemoryStorage(false);
