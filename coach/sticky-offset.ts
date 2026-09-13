/**
 * Keep keyboard focus and scrolled-to content clear of the sticky summary header
 * (WCAG 2.2, 2.4.11 Focus Not Obscured).
 *
 * The header's height changes with the assignment sentence and the session
 * controls, so no fixed CSS value is right. This publishes its current height as
 * `--coach-top-height`, which `scroll-padding-top` in styles/layout.css reads. It is one of
 * the justified direct-DOM accessibility utilities: it writes a single custom
 * property on the root element and nothing else.
 */
export function trackStickyHeaderHeight(
  header: HTMLElement | null,
  root: HTMLElement = document.documentElement,
) {
  if (!header || typeof ResizeObserver === "undefined") return () => {};
  const publish = () => root.style.setProperty("--coach-top-height", `${Math.ceil(header.offsetHeight)}px`);
  const observer = new ResizeObserver(publish);
  observer.observe(header);
  publish();
  return () => {
    observer.disconnect();
    root.style.removeProperty("--coach-top-height");
  };
}
