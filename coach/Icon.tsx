/**
 * The interface icon set: stroke paths on a 24px grid, drawn in currentColor so
 * an icon always takes its control's neutral ink. Inline in the script bundle, so
 * icons cost no request and no offline file. Icons are decorative; the control
 * carries the words.
 */
const ICONS = {
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  moon: "M19.5 14.5A8 8 0 1 1 9.5 4.5a6.3 6.3 0 0 0 10 10z",
  sliders: "M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M8 14v6",
  explore: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5 5-2z",
  scale: "M4 18V6M4 18h16M8 18v-4M12 18v-8M16 18V7M20 18V4",
  sound: "M5 14h3l5 4V6l-5 4H5v4zM17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12",
  midi: "M4 6h16v12H4zM7 6v8M10 6v8M14 6v8M17 6v8M8.5 6v5M15.5 6v5",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9L12 3.5z",
  close: "M6 6l12 12M18 6 6 18",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="coach-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}
