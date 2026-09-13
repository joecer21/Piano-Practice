import { useState, useSyncExternalStore } from "react";
import type { ChangeEvent } from "react";
import type { MixPart, SoundSettings as SoundSettingsService } from "./bridge.js";
import type { SamplerLibraryStatus, SamplerSnapshot } from "./sampler.js";

type SoundSettingsProps = {
  settings: SoundSettingsService;
  sampler: SamplerSnapshot;
};

export function SoundSettings({ settings, sampler }: SoundSettingsProps) {
  const snapshot = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const [loop, setLoop] = useState(false);
  const [switchingLibrary, setSwitchingLibrary] = useState(false);
  const libraries = sortedLibraries(sampler);

  const selectLibrary = async (event: ChangeEvent<HTMLSelectElement>) => {
    setSwitchingLibrary(true);
    try {
      await settings.selectLibrary(event.target.value);
    } finally {
      setSwitchingLibrary(false);
    }
  };

  return (
    <details id="settings-drawer" className="coach-settings">
      <summary>Sound and playback settings</summary>
      <div className="coach-settings-body">
        <section aria-labelledby="sound-playback-title">
          <h2 id="sound-playback-title">Sound and playback</h2>
          <div className="coach-settings-grid">
            <RangeControl
              id="tempo-slider"
              label="Tempo"
              min={60}
              max={140}
              value={snapshot.tempoBpm}
              output={`${snapshot.tempoBpm} BPM`}
              onChange={settings.setTempo}
            />
            <label className="coach-setting">
              <span>Piano model</span>
              <select
                id="piano-model"
                value={sampler.activeLibraryId ?? ""}
                disabled={switchingLibrary || libraries.length === 0}
                onChange={(event) => void selectLibrary(event)}
              >
                {libraries.length === 0 ? <option value="">Loading models…</option> : null}
                {libraries.map(([id, library]) => (
                  <option key={id} value={id}>
                    {libraryOptionLabel(library)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div
            id="sampler-status"
            className={`coach-sampler-status ${samplerTone(libraries)}`}
            aria-live="polite"
          >
            {libraries.length === 0 ? <span>Loading piano…</span> : null}
            {libraries.map(([id, library]) => (
              <span className="sampler-row" key={id}>
                {samplerRow(id, library, sampler.activeLibraryId)}
              </span>
            ))}
          </div>

          <div className="coach-settings-actions">
            <button className="coach-secondary" type="button" onClick={() => void settings.playAll(loop)}>
              Play All
            </button>
            <label className="coach-check" htmlFor="play-all-loop">
              <input
                id="play-all-loop"
                type="checkbox"
                checked={loop}
                onChange={(event) => setLoop(event.target.checked)}
              />{" "}
              Loop
            </label>
            <button className="coach-secondary" type="button" onClick={settings.stopAll}>
              Stop All
            </button>
          </div>
        </section>

        <details className="coach-mix-settings">
          <summary>Mix and feel</summary>
          <div className="coach-mix-body">
            {(["left", "lead"] as const).map((part) => (
              <MixControl
                key={part}
                part={part}
                volume={snapshot.mix[part].volumeDb}
                muted={snapshot.mix[part].muted}
                onVolume={settings.setMixVolume}
                onMuted={settings.setMixMuted}
              />
            ))}

            <fieldset>
              <legend>Feel</legend>
              <label className="coach-check" htmlFor="humanize-toggle">
                <input
                  id="humanize-toggle"
                  type="checkbox"
                  checked={snapshot.humanize.enabled}
                  onChange={(event) => settings.setHumanizeEnabled(event.target.checked)}
                />{" "}
                Humanize and swing
              </label>
              <RangeControl
                id="humanize-amount"
                label="Feel amount"
                min={0}
                max={100}
                value={snapshot.humanize.amountPercent}
                output={`${snapshot.humanize.amountPercent}%`}
                disabled={!snapshot.humanize.enabled}
                onChange={settings.setHumanizeAmount}
              />
              <RangeControl
                id="swing-amount"
                label="Swing push"
                min={0}
                max={100}
                value={snapshot.humanize.swingPercent}
                output={`${snapshot.humanize.swingPercent}%`}
                disabled={!snapshot.humanize.enabled}
                onChange={settings.setSwingAmount}
              />
            </fieldset>

            <fieldset>
              <legend>Space</legend>
              <RangeControl
                id="reverb-wet"
                label="Reverb mix"
                min={0}
                max={60}
                value={snapshot.effects.reverbPercent}
                output={`${snapshot.effects.reverbPercent}%`}
                onChange={settings.setReverb}
              />
              <label className="coach-check" htmlFor="room-size-toggle">
                <input
                  id="room-size-toggle"
                  type="checkbox"
                  checked={snapshot.effects.largeRoom}
                  onChange={(event) => settings.setLargeRoom(event.target.checked)}
                />{" "}
                Large room
              </label>
              <RangeControl
                id="motif-width"
                label="Motif width"
                min={0}
                max={100}
                value={snapshot.effects.motifWidthPercent}
                output={`${snapshot.effects.motifWidthPercent}%`}
                onChange={settings.setMotifWidth}
              />
            </fieldset>
          </div>
        </details>
      </div>
    </details>
  );
}

type RangeControlProps = {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
  output: string;
  disabled?: boolean;
  onChange(value: number): void;
};

function RangeControl({ id, label, min, max, value, output, disabled = false, onChange }: RangeControlProps) {
  return (
    <div className="coach-setting">
      <span>
        <label htmlFor={id}>{label}</label> <output>{output}</output>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function MixControl({
  part,
  volume,
  muted,
  onVolume,
  onMuted,
}: {
  part: MixPart;
  volume: number;
  muted: boolean;
  onVolume(part: MixPart, value: number): void;
  onMuted(part: MixPart, muted: boolean): void;
}) {
  const label = part === "left" ? "Left hand" : "Motif / lead";
  return (
    <fieldset>
      <legend>{label}</legend>
      <RangeControl
        id={`mix-${part}-volume`}
        label="Volume"
        min={-24}
        max={6}
        value={volume}
        output={muted ? "Muted" : `${volume} dB`}
        onChange={(value) => onVolume(part, value)}
      />
      <label className="coach-check" htmlFor={`mix-${part}-mute`}>
        <input
          id={`mix-${part}-mute`}
          type="checkbox"
          checked={muted}
          onChange={(event) => onMuted(part, event.target.checked)}
        />{" "}
        Mute
      </label>
    </fieldset>
  );
}

function sortedLibraries(snapshot: SamplerSnapshot): [string, SamplerLibraryStatus][] {
  return Object.entries(snapshot.libraries).sort(([, left], [, right]) => {
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
    return (left.label ?? "").localeCompare(right.label ?? "");
  });
}

function libraryOptionLabel(library: SamplerLibraryStatus): string {
  let label = library.label ?? library.libraryId ?? "Piano";
  if (library.isDefault) label += " (Default)";
  if (library.phase === "error" || library.phase === "timeout") label += " · Error";
  else if (["progress", "init", "switching"].includes(library.phase ?? "")) label += " · Loading";
  return label;
}

function samplerRow(id: string, library: SamplerLibraryStatus, activeId: string | null): string {
  const label = library.label ?? id;
  const active = library.active || id === activeId ? " (active)" : "";
  switch (library.phase) {
    case "ready":
      return `${label} · Ready${active}`;
    case "progress":
    case "init":
    case "switching": {
      const percent = typeof library.progress === "number" ? ` ${Math.round(library.progress * 100)}%` : "";
      return `${label} · Loading${percent}`;
    }
    case "timeout":
      return `${label} · Timeout – reselect to retry`;
    case "error":
      return `${label} · Error – ${library.error || "check connection"}`;
    case "standby":
      return `${label} · Pick from menu to load`;
    default:
      return `${label} · Warming up`;
  }
}

function samplerTone(libraries: [string, SamplerLibraryStatus][]): string {
  if (libraries.some(([, library]) => library.phase === "error" || library.phase === "timeout")) {
    return "error";
  }
  return libraries.some(([, library]) => library.isDefault && library.phase === "ready")
    ? "ready"
    : "loading";
}
