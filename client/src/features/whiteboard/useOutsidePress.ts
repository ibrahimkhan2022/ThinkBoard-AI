/**
 * Calls `onOutside` when a press lands outside every one of `inside` (the panel and the button that opens it) while `open`.
 * On a touch build the panel closes through its own buttons, so this does nothing there.
 */
export function useOutsidePress(_open: boolean, _onOutside: () => void, _inside: { current: unknown }[]) {}
