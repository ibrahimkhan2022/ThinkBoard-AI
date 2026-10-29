import type { RefObject } from "react";

/** Native has no wheel or hardware keyboard; touch gestures cover navigation. */
export function useWebInput(_surface: RefObject<unknown>) {}
