import type { ShareLocationPort } from "../application/share-controller.js";

/** The only production boundary allowed to read or mutate the address bar. */
export function createShareLocation(browser: Window): ShareLocationPort {
  return {
    currentUrl: () => browser.location.href,
    fragment: () => browser.location.hash,
    replaceFragment(fragment) {
      const normalized = fragment.startsWith("#") ? fragment : `#${fragment}`;
      if (browser.location.hash === normalized) return;
      const url = new URL(browser.location.href);
      url.hash = normalized;
      // Assignment changes are application history, not browser navigation.
      browser.history.replaceState(browser.history.state, "", url);
    },
    subscribe(listener) {
      browser.addEventListener("hashchange", listener);
      return () => browser.removeEventListener("hashchange", listener);
    },
  };
}
