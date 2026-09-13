# Learner experience design

The approved upgrade direction is a warm, low-light **Studio** theme with a warm **Paper** alternative. Studio is always the first-visit default; the two-way theme control does not follow the operating-system colour scheme. Interface chrome stays neutral, while hue is reserved for notes that are sounding in the left or right hand.

The learner-facing home is the **Stage**: assignment introduction, start action, keyboard and timeline, practice controls, and one compact Recent practice section. Supporting controls live in a modeless tool surface. It is a collapsible right panel at desktop widths, a right overlay on landscape tablets, and a bottom sheet capped at 70% of the viewport on narrower screens. Because the keyboard remains usable while the surface is open, the surface is not a modal dialog and does not trap focus or make the Stage inert. Escape and the close control dismiss it and return focus to its trigger.

The approved Phase 1 interactive mock-up was reviewed outside this repository and has not been exported into the workspace. Add its HTML or reference screenshots under `docs/design-reference/` when an export is available; do not substitute implementation screenshots and call them the approved source.

The icon implementation is a small inline React path set in `coach/Icon.tsx`. It adds no web request or offline-cache entry; it is not an SVG `<symbol>` sprite.
