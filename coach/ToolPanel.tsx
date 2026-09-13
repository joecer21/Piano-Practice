import type { ReactNode } from "react";
import { Icon } from "./Icon.js";
import type { IconName } from "./Icon.js";

export type ToolId = "assignment" | "reference" | "sound" | "input" | "library" | "history";

const TOOLS: ReadonlyArray<{ id: ToolId | "explore"; label: string; icon: IconName }> = [
  { id: "assignment", label: "Change assignment", icon: "sliders" },
  { id: "explore", label: "Explore", icon: "explore" },
  { id: "reference", label: "Scale & shape", icon: "scale" },
  { id: "sound", label: "Sound", icon: "sound" },
  { id: "input", label: "MIDI & input", icon: "midi" },
  { id: "library", label: "Star & share", icon: "star" },
];

export function ToolRail({
  active,
  onSelect,
  onExplore,
}: {
  active: ToolId | null;
  onSelect(tool: ToolId): void;
  onExplore(): void;
}) {
  return (
    <nav className="coach-tool-rail" aria-label="Coach tools">
      {TOOLS.map((tool) => {
        const selected = tool.id !== "explore" && active === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            className="coach-tool-trigger"
            data-tool-trigger={tool.id}
            aria-controls={tool.id === "explore" ? "coach-practice" : "coach-tool-panel"}
            aria-expanded={tool.id === "explore" ? undefined : selected}
            onClick={() => (tool.id === "explore" ? onExplore() : onSelect(tool.id))}
          >
            <Icon name={tool.icon} />
            <span>{tool.label}</span>
          </button>
        );
      })}
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
  onHistoryContainer,
}: {
  active: ToolId | null;
  onClose(): void;
  assignment: ReactNode;
  reference: ReactNode;
  sound: ReactNode;
  input: ReactNode;
  library: ReactNode;
  onHistoryContainer(container: HTMLDivElement | null): void;
}) {
  const content: Record<ToolId, ReactNode> = {
    assignment,
    reference,
    sound,
    input,
    library,
    history: <div ref={onHistoryContainer} />,
  };
  const label =
    active === "history" ? "Practice history" : (TOOLS.find((tool) => tool.id === active)?.label ?? "Tools");

  return (
    <aside
      id="coach-tool-panel"
      className="coach-tool-panel"
      aria-labelledby="coach-tool-panel-title"
      hidden={active === null}
    >
      <div className="coach-tool-panel-head">
        <h2 id="coach-tool-panel-title">{label}</h2>
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
