import type { ReactNode } from "react";
import { Icon } from "./Icon.js";
import type { IconName } from "./Icon.js";

export type ToolId = "assignment" | "reference" | "sound" | "input" | "library";

const TOOLS: ReadonlyArray<{ id: Exclude<ToolId, "library">; label: string; icon: IconName }> = [
  { id: "assignment", label: "Change assignment", icon: "sliders" },
  { id: "reference", label: "Shapes & scale", icon: "shapes" },
  { id: "sound", label: "Sound", icon: "sound" },
  { id: "input", label: "MIDI", icon: "midi" },
];

const PANEL_TITLES: Record<ToolId, string> = {
  assignment: "Change assignment",
  reference: "Shapes & scale",
  sound: "Sound",
  input: "MIDI keyboard",
  library: "Star & share",
};

export function ToolRail({
  active,
  onSelect,
  onShare,
  midiDevice,
}: {
  active: ToolId | null;
  onSelect(tool: ToolId): void;
  onShare(): void;
  /** The connected MIDI keyboard's name, shown in place of "MIDI". */
  midiDevice: string | null;
}) {
  const trigger = (id: ToolId) => ({
    type: "button" as const,
    "data-tool-trigger": id,
    "aria-controls": "coach-tool-panel",
    "aria-expanded": active === id,
    onClick: () => onSelect(id),
  });
  return (
    <nav className="coach-tool-rail" aria-label="Coach tools">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          className="coach-tool-trigger"
          {...trigger(tool.id)}
          aria-label={
            tool.id === "input" && midiDevice ? `MIDI keyboard: ${midiDevice} connected` : undefined
          }
        >
          <Icon name={tool.icon} />
          {tool.id === "input" && midiDevice ? (
            <span>
              {midiDevice} <span className="coach-tool-sub">connected</span>
            </span>
          ) : (
            <span>{tool.label}</span>
          )}
        </button>
      ))}
      <i className="coach-tool-sep" aria-hidden="true" />
      <button
        className="coach-tool-trigger coach-tool-icon"
        {...trigger("library")}
        aria-label="Star & share"
      >
        <Icon name="star" />
      </button>
      <button
        type="button"
        className="coach-tool-trigger coach-tool-icon"
        aria-label="Share link"
        onClick={onShare}
      >
        <Icon name="share" />
      </button>
    </nav>
  );
}

export function ToolPanel({
  active,
  onClose,
  assignment,
  reference,
  sound,
  input,
  library,
}: {
  active: ToolId | null;
  onClose(): void;
  assignment: ReactNode;
  reference: ReactNode;
  sound: ReactNode;
  input: ReactNode;
  library: ReactNode;
}) {
  const content: Record<ToolId, ReactNode> = { assignment, reference, sound, input, library };

  return (
    <aside
      id="coach-tool-panel"
      className="coach-tool-panel"
      aria-labelledby="coach-tool-panel-title"
      data-active-tool={active ?? undefined}
      hidden={active === null}
    >
      <div className="coach-tool-panel-head">
        <h2 id="coach-tool-panel-title">{active ? PANEL_TITLES[active] : "Tools"}</h2>
        <button type="button" className="coach-tool-close" aria-label="Close tools" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="coach-tool-panel-scroll">
        {(Object.keys(content) as ToolId[]).map((tool) => (
          <div key={tool} className="coach-tool-section" data-tool={tool} hidden={active !== tool}>
            {content[tool]}
          </div>
        ))}
      </div>
    </aside>
  );
}
