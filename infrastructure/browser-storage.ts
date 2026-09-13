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

/**
 * Call `listener` when another tab or window of this site changes `key` (the
 * browser does not fire `storage` in the tab that wrote). Returns an unsubscribe.
 */
export function subscribeToStorageKey(
  events: Pick<Window, "addEventListener" | "removeEventListener"> | null,
  key: string,
  listener: () => void,
): () => void {
  if (!events) return () => {};
  const onStorage = (event: StorageEvent) => {
    // A null key means another tab cleared all of this site's storage.
    if (event.key === key || event.key === null) listener();
  };
  events.addEventListener("storage", onStorage);
  return () => events.removeEventListener("storage", onStorage);
}

function currentWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}
