/**
 * The interface icon set: stroke paths on a 24px grid, drawn in currentColor so
 * an icon always takes its control's neutral ink. Inline in the script bundle, so
 * icons cost no request and no offline file. Icons are decorative; the control
 * carries the words.
 */
const ICONS = {
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  moon: "M19.5 14.5A8 8 0 1 1 9.5 4.5a6.3 6.3 0 0 0 10 10z",
  sliders:
    "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M13 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M7 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M15 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  shapes:
    "M3.5 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M9 7.5a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M14.5 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  sound: "M4 9.5v5h4l5 4v-13l-5 4zM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11",
  midi: "M3.5 12a8.5 8.5 0 1 0 17.0 0a8.5 8.5 0 1 0 -17.0 0M7.8 12.2h.01M9.4 8.9h.01M12 7.6h.01M14.6 8.9h.01M16.2 12.2h.01M10 16.5h4",
  star: "M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z",
  share: "M12 15V4M8 8l4-4 4 4M5 12v7.5h14V12",
  play: "M8 5.5l11 6.5-11 6.5z",
  pause: "M8.5 5.5v13M15.5 5.5v13",
  loop: "M17 3l3 3-3 3M4 12V9.5A3.5 3.5 0 0 1 7.5 6H20M7 21l-3-3 3-3M20 12v2.5a3.5 3.5 0 0 1-3.5 3.5H4",
  next: "M6 5.5l9 6.5-9 6.5zM18.5 5.5v13",
  close: "M6 6l12 12M18 6 6 18",
  more: "M5.5 12h.01M12 12h.01M18.5 12h.01",
  lock: "M7 11h10a2 2 0 0 1 2 2v5.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V13a2 2 0 0 1 2-2zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  dice: "M7.5 4h9A3.5 3.5 0 0 1 20 7.5v9a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 16.5v-9A3.5 3.5 0 0 1 7.5 4zM9 9h.01M15 15h.01M12 12h.01M15 9h.01M9 15h.01",
  undo: "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  trash: "M4.5 7h15M10 7V4.5h4V7M6.5 7l1 13h9l1-13",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="coach-icon" data-icon={name} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}
