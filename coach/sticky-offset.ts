/**
 * Keep keyboard focus and scrolled-to content clear of the sticky summary header
 * and the open bottom sheet (WCAG 2.2, 2.4.11 Focus Not Obscured).
 *
 * Both change height with their content, so no fixed CSS value is right. These
 * publish each one's current height as a custom property on the root element,
 * which `scroll-padding` in styles/layout.css reads. They are among the justified
 * direct-DOM accessibility utilities: each writes a single custom property and
 * nothing else.
 */
export function trackStickyHeaderHeight(
  header: HTMLElement | null,
  root: HTMLElement = document.documentElement,
) {
  return trackHeight(header, "--coach-top-height", root);
}

/**
 * The tool panel host is a fixed bottom sheet on narrow screens; its height is 0
 * while the panel is closed or hidden by focus mode. Layout only reads the value
 * at those widths, so publishing it at every width is harmless.
 */
export function trackBottomSheetHeight(
  host: HTMLElement | null,
  root: HTMLElement = document.documentElement,
) {
  return trackHeight(host, "--coach-sheet-height", root);
}

function trackHeight(element: HTMLElement | null, property: string, root: HTMLElement) {
  if (!element || typeof ResizeObserver === "undefined") return () => {};
  const publish = () => root.style.setProperty(property, `${Math.ceil(element.offsetHeight)}px`);
  const observer = new ResizeObserver(publish);
  observer.observe(element);
  publish();
  return () => {
    observer.disconnect();
    root.style.removeProperty(property);
  };
}
