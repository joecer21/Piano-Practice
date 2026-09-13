// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { MOTIF_STYLES } from "../theory.js";
import { populateMotifSelector, updateMotifOffering } from "../ui.js";

function selector() {
  const dom = { motif: document.createElement("select") };
  populateMotifSelector(dom, MOTIF_STYLES);
  const option = (id) => [...dom.motif.options].find((candidate) => candidate.value === id);
  return { dom, option };
}

describe("legacy motif selector", () => {
  it("disables the patterns a mode does not offer and says why", () => {
    const { dom, option } = selector();
    updateMotifOffering(dom, "majorBlues");
    expect(option("funk-sync").disabled).toBe(true);
    expect(option("funk-sync").textContent).toBe(
      "Funk Syncopation - root groove with rests (intermediate) - not for Major Blues",
    );
    expect(option("funk-sync-6").disabled).toBe(false);
    expect(option("blues-riff-major").disabled).toBe(false);
    expect(option("blues-riff-minor").disabled).toBe(true);
    expect(option("none").disabled).toBe(false);

    updateMotifOffering(dom, "major");
    expect(option("funk-sync").disabled).toBe(false);
    expect(option("funk-sync").textContent).toBe("Funk Syncopation - root groove with rests (intermediate)");
    expect(option("funk-sync-6").disabled).toBe(true);
  });

  it("keeps the learner's selected pattern selected when a mode change stops offering it", () => {
    const { dom, option } = selector();
    dom.motif.value = "harmonic-rise";
    updateMotifOffering(dom, "pentatonicMinor");
    expect(dom.motif.value).toBe("harmonic-rise");
    expect(option("harmonic-rise").disabled).toBe(true);
  });
});
