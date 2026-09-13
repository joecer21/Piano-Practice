// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SoundSettings } from "../coach/SoundSettings.tsx";

const SAMPLER = {
  activeLibraryId: "local-soft",
  libraries: {
    "fuhton-piano": {
      libraryId: "fuhton-piano",
      label: "Fuhton Piano",
      phase: "standby",
      isDefault: false,
    },
    "local-soft": {
      libraryId: "local-soft",
      label: "Piano Lite - Soft",
      phase: "ready",
      progress: 1,
      isDefault: true,
      active: true,
    },
    "local-bright": {
      libraryId: "local-bright",
      label: "Piano HL - Bright",
      phase: "progress",
      progress: 0.42,
      isDefault: false,
    },
  },
};

function createSettings() {
  const listeners = new Set();
  let snapshot = {
    tempoBpm: 90,
    mix: {
      left: { volumeDb: 0, muted: false },
      lead: { volumeDb: 0, muted: false },
    },
    humanize: { enabled: false, amountPercent: 0, swingPercent: 0 },
    effects: { reverbPercent: 0, largeRoom: false, motifWidthPercent: 0 },
  };
  const update = (patch) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setTempo: vi.fn((tempoBpm) => update({ tempoBpm })),
    selectLibrary: vi.fn(async () => {}),
    playAll: vi.fn(async () => {}),
    stopAll: vi.fn(),
    setMixVolume: vi.fn(),
    setMixMuted: vi.fn(),
    setHumanizeEnabled: vi.fn((enabled) => update({ humanize: { ...snapshot.humanize, enabled } })),
    setHumanizeAmount: vi.fn(),
    setSwingAmount: vi.fn(),
    setReverb: vi.fn(),
    setLargeRoom: vi.fn(),
    setMotifWidth: vi.fn(),
  };
}

afterEach(cleanup);

describe("Sound settings", () => {
  it("renders the active piano, ordered model status, and reactive tempo", () => {
    const settings = createSettings();
    render(<SoundSettings settings={settings} sampler={SAMPLER} />);

    const select = screen.getByLabelText("Piano model");
    expect(select.value).toBe("local-soft");
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "Piano Lite - Soft (Default)",
      "Fuhton Piano",
      "Piano HL - Bright · Loading",
    ]);
    expect(screen.getByText("Piano Lite - Soft · Ready (active)")).toBeTruthy();
    expect(screen.getByText("Piano HL - Bright · Loading 42%")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Tempo"), { target: { value: "112" } });
    expect(settings.setTempo).toHaveBeenCalledWith(112);
    expect(screen.getByText("112 BPM")).toBeTruthy();
  });

  it("routes playback, model, mix, feel, and space changes through the service", async () => {
    const settings = createSettings();
    render(<SoundSettings settings={settings} sampler={SAMPLER} />);

    fireEvent.click(screen.getByText("Sound and playback settings"));
    fireEvent.click(screen.getByLabelText("Loop"));
    fireEvent.click(screen.getByRole("button", { name: "Play All" }));
    expect(settings.playAll).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Stop All" }));
    expect(settings.stopAll).toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Piano model"), { target: { value: "local-bright" } });
    await waitFor(() => expect(settings.selectLibrary).toHaveBeenCalledWith("local-bright"));

    fireEvent.click(screen.getByText("Mix and feel"));
    const left = screen.getByRole("group", { name: "Left hand" });
    fireEvent.change(within(left).getByLabelText("Volume"), { target: { value: "-6" } });
    fireEvent.click(within(left).getByLabelText("Mute"));
    expect(settings.setMixVolume).toHaveBeenCalledWith("left", -6);
    expect(settings.setMixMuted).toHaveBeenCalledWith("left", true);

    fireEvent.click(screen.getByLabelText("Humanize and swing"));
    expect(settings.setHumanizeEnabled).toHaveBeenCalledWith(true);
    expect(screen.getByLabelText("Feel amount").disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Reverb mix"), { target: { value: "25" } });
    fireEvent.click(screen.getByLabelText("Large room"));
    expect(settings.setReverb).toHaveBeenCalledWith(25);
    expect(settings.setLargeRoom).toHaveBeenCalledWith(true);
  });

  it("disables model selection before the sampler registry is available", () => {
    render(<SoundSettings settings={createSettings()} sampler={{ activeLibraryId: null, libraries: {} }} />);
    const select = screen.getByLabelText("Piano model");
    expect(select.disabled).toBe(true);
    expect(select.options[0].textContent).toBe("Loading models…");
  });

  it("surfaces a sampler failure in the visible status region", () => {
    render(
      <SoundSettings
        settings={createSettings()}
        sampler={{
          activeLibraryId: "local-soft",
          libraries: {
            "local-soft": {
              libraryId: "local-soft",
              label: "Piano Lite - Soft",
              phase: "error",
              error: "sample request failed",
              isDefault: true,
            },
          },
        }}
      />,
    );
    const status = document.getElementById("sampler-status");
    expect(status.textContent).toContain("Error – sample request failed");
    expect(status.classList.contains("error")).toBe(true);
  });
});
