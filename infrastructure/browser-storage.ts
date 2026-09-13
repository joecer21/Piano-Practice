/** Browser storage is infrastructure: application repositories accept this port, not `window`. */
export type BrowserStorage = Pick<Storage, "getItem" | "setItem">;

export function browserStorage(
  browser: Pick<Window, "localStorage"> | null = currentWindow(),
): BrowserStorage | null {
  try {
    return browser?.localStorage ?? null;
  } catch {
    return null;
  }
}

function currentWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}
