import { expect, test } from "@playwright/test";
import { installFakeMidi, openMidiInput } from "./support.js";

const key = (page, note) => page.locator(`#piano-visual [data-note="${note}"]`);
const send = (page, bytes) => page.evaluate((data) => window.__fakeMidi.send("piano", data), bytes);

test("a connected MIDI keyboard is mirrored on the keyboard, pedal included", async ({ page }) => {
  await installFakeMidi(page);
  await page.goto("/");
  await openMidiInput(page);

  const connect = page.getByRole("button", { name: "Connect MIDI keyboard" });
  await expect(connect).toBeVisible();
  // Nothing is requested until the player asks: browsers prompt for MIDI permission.
  expect(await page.evaluate(() => window.__fakeMidi.requested)).toBe(0);

  await page.evaluate(() => window.__fakeMidi.plug("piano", "Stage Piano"));
  await connect.click();
  await expect(page.getByText("Mirroring Stage Piano")).toBeVisible();

  await send(page, [0x90, 60, 100]);
  await expect(key(page, "C4")).toHaveAttribute("data-played", "held");

  // Sustain pedal: the released E rings on as "sustained" until the pedal lifts.
  await send(page, [0xb0, 64, 127]);
  await send(page, [0x90, 64, 90]);
  await send(page, [0x80, 64, 0]);
  await expect(key(page, "E4")).toHaveAttribute("data-played", "sustained");
  await send(page, [0xb0, 64, 0]);
  await expect(key(page, "E4")).not.toHaveAttribute("data-played");

  // Unplugging mid-note must not leave the key lit.
  await page.evaluate(() => window.__fakeMidi.unplug("piano"));
  await expect(key(page, "C4")).not.toHaveAttribute("data-played");
  await expect(page.getByText(/No MIDI keyboard found/)).toBeVisible();
});

test("the ring for a played note never uses a hand colour", async ({ page }) => {
  await installFakeMidi(page);
  await page.goto("/");
  await openMidiInput(page);
  await page.evaluate(() => window.__fakeMidi.plug("piano", "Stage Piano"));
  await page.getByRole("button", { name: "Connect MIDI keyboard" }).click();
  await send(page, [0x90, 60, 100]);
  await expect(key(page, "C4")).toHaveAttribute("data-played", "held");

  // Poll so a key's box-shadow transition has finished before comparing colours.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const toRgb = (value) => {
          const probe = document.createElement("span");
          probe.style.color = value.trim();
          document.body.append(probe);
          const rgb = getComputedStyle(probe).color;
          probe.remove();
          return rgb;
        };
        const hands = [toRgb(root.getPropertyValue("--hand-lh")), toRgb(root.getPropertyValue("--hand-rh"))];
        const shadow = getComputedStyle(document.querySelector('#piano-visual [data-note="C4"]')).boxShadow;
        const ringColour = shadow.match(/rgba?\([^)]+\)/)?.[0] ?? "";
        return { hasRing: /3px inset/.test(shadow), usesHandHue: hands.includes(ringColour) };
      }),
    )
    .toEqual({ hasRing: true, usesHandHue: false });
});

test("a denied MIDI permission is explained and can be retried", async ({ page }) => {
  await installFakeMidi(page, { deny: true });
  await page.goto("/");
  await openMidiInput(page);
  await page.getByRole("button", { name: "Connect MIDI keyboard" }).click();
  await expect(page.getByText(/MIDI access was blocked/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("without Web MIDI the app explains in one line and everything else still works", async ({ page }) => {
  // Safari: requestMIDIAccess does not exist at all.
  await page.addInitScript(() => {
    delete Navigator.prototype.requestMIDIAccess;
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await openMidiInput(page);

  const inputPanel = page.locator('.coach-tool-section[data-tool="input"]');
  await expect(inputPanel).toContainText("this browser does not support them");
  await expect(inputPanel.getByRole("button")).toHaveCount(0);

  await page.getByLabel("Computer keys").check();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("a");
  await expect(key(page, "C4")).toHaveAttribute("data-played", "held");
  await page.keyboard.up("a");
  expect(pageErrors).toEqual([]);
});
