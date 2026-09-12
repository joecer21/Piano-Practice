import { describe, expect, it } from "vitest";
import { createAppStore } from "../application/state.js";
import { generateAssignment } from "../domain/assignment.js";

describe("Application state store", () => {
  it("commits assignments and supports undo/redo without replacing the state reference", () => {
    const store = createAppStore();
    const stateReference = store.state;
    const first = generateAssignment({ ...store.state.inputs, seed: "history-a" });
    store.commitAssignment(first);
    const second = generateAssignment({ ...store.state.inputs, key: "D", presetId: null, seed: "history-b" });
    store.commitAssignment(second);

    expect(store.state).toBe(stateReference);
    expect(store.canUndo()).toBe(true);
    expect(store.undo()?.id).toBe(first.id);
    expect(store.state.inputs.key).toBe("C");
    expect(store.canRedo()).toBe(true);
    expect(store.redo()?.id).toBe(second.id);
    expect(store.state.inputs.key).toBe("D");
    expect(store.state.derived.score.sourceAssignmentId).toBe(second.id);
    expect(store.state.derived.score.meta.totalBeats).toBe(second.progression.length * 4);
  });

  it("honors component locks during a seeded reroll", () => {
    const store = createAppStore();
    const before = { ...store.state.inputs };
    store.setLocks({ harmony: true, motif: true });
    const rerolled = store.reroll("locked-reroll");

    expect(rerolled.progressionPresetId).toBe(before.progressionPresetId);
    expect(rerolled.customProgressionRoman).toEqual(before.customProgressionRoman);
    expect(rerolled.motifId).toBe(before.motifId);
    expect(rerolled.key).not.toBe(before.key);
    expect(rerolled.lhId).not.toBe(before.lhId);
  });

  it("preserves preset anchors when only the motif is unlocked", () => {
    const store = createAppStore();
    const before = { ...store.state.inputs };
    store.setLocks({ key: true, harmony: true, groove: true, motif: false });
    const rerolled = store.reroll("motif-only");

    expect(rerolled.presetId).toBe(before.presetId);
    expect(rerolled.key).toBe(before.key);
    expect(rerolled.progressionPresetId).toBe(before.progressionPresetId);
    expect(rerolled.lhId).toBe(before.lhId);
    expect(rerolled.motifId).not.toBe(before.motifId);
  });

  it("advances through a reproducible reroll sequence when no seed is supplied", () => {
    const firstStore = createAppStore();
    const secondStore = createAppStore();

    const firstSequence = [firstStore.reroll(), firstStore.reroll()].map((inputs) => ({ ...inputs }));
    const secondSequence = [secondStore.reroll(), secondStore.reroll()].map((inputs) => ({ ...inputs }));

    expect(secondSequence).toEqual(firstSequence);
    expect(firstSequence[1].seed).not.toBe(firstSequence[0].seed);
  });

  it("does not add duplicate assignment IDs to history", () => {
    const store = createAppStore();
    const assignment = generateAssignment(store.state.inputs);
    store.commitAssignment(assignment);
    store.commitAssignment(assignment);
    expect(store.state.history.past).toHaveLength(0);
  });

  it("bounds history and clears redo after a new commit", () => {
    const store = createAppStore({ historyLimit: 2 });
    ["C", "D", "E", "F"].forEach((key, index) => {
      store.commitAssignment(
        generateAssignment({
          ...store.state.inputs,
          key,
          presetId: null,
          seed: `bounded-${index}`,
        }),
      );
    });
    expect(store.state.history.past).toHaveLength(2);
    store.undo();
    expect(store.canRedo()).toBe(true);
    store.commitAssignment(
      generateAssignment({
        ...store.state.inputs,
        key: "G",
        presetId: null,
        seed: "new-branch",
      }),
    );
    expect(store.canRedo()).toBe(false);
  });
});

describe("store subscription", () => {
  it("notifies on commit, undo and redo, and stops after unsubscribe", async () => {
    const { createAppStore } = await import("../application/state.js");
    const { generateAssignment, DEFAULT_ASSIGNMENT_INPUTS } = await import("../domain/assignment.js");
    const store = createAppStore();
    const calls = [];
    const unsubscribe = store.subscribe(() => calls.push(store.state.assignment?.id));

    const first = generateAssignment({ ...DEFAULT_ASSIGNMENT_INPUTS, seed: "subscribe-1" });
    const second = generateAssignment({ ...DEFAULT_ASSIGNMENT_INPUTS, seed: "subscribe-2", key: "D" });
    store.commitAssignment(first);
    store.commitAssignment(second);
    store.undo();
    store.redo();
    expect(calls).toEqual([first.id, second.id, first.id, second.id]);

    unsubscribe();
    store.undo();
    expect(calls).toHaveLength(4);
  });
});
