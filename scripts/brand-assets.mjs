// Render the PNG icons and the link-preview image from public/icons/icon.svg.
//   node scripts/brand-assets.mjs
// Outputs are committed; rerun only when the icon or the preview card changes.
// Uses the Chromium that Playwright already installs for the browser tests.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const publicDir = new URL("../public/", import.meta.url);
const svg = readFileSync(new URL("icons/icon.svg", publicDir), "utf8");
const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

const INK = "#2a1f19";
const SURFACE = "#f6f1eb";

const icon = (size, padding = 0) => `
  <body style="margin:0;background:${padding ? INK : "transparent"}">
    <img src="${svgDataUrl}" style="display:block;width:${size - padding * 2}px;height:${size - padding * 2}px;margin:${padding}px">
  </body>`;

const preview = `
  <body style="margin:0;width:1200px;height:630px;display:flex;align-items:center;gap:64px;padding:0 96px;box-sizing:border-box;background:${SURFACE};color:${INK};font-family:Georgia,'Times New Roman',serif">
    <img src="${svgDataUrl}" style="width:260px;height:260px;flex:none">
    <div>
      <div style="font:600 30px system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#6c5a4f">5-Minute Improv Coach</div>
      <div style="font-size:68px;line-height:1.08;margin-top:20px">Something to play right now, and why it works.</div>
      <div style="font:400 30px system-ui,sans-serif;margin-top:28px;color:#6c5a4f">Hands apart, chord by chord, note by note. In your browser.</div>
    </div>
  </body>`;

const outputs = [
  { file: "icons/icon-192.png", width: 192, height: 192, html: icon(192) },
  { file: "icons/icon-512.png", width: 512, height: 512, html: icon(512) },
  // Maskable: the platform may crop to a circle, so keep the glyph in the safe zone.
  { file: "icons/icon-maskable-512.png", width: 512, height: 512, html: icon(512, 64) },
  { file: "icons/apple-touch-icon.png", width: 180, height: 180, html: icon(180) },
  { file: "og-image.png", width: 1200, height: 630, html: preview },
];

const browser = await chromium.launch();
try {
  for (const output of outputs) {
    const page = await browser.newPage({ viewport: { width: output.width, height: output.height } });
    await page.setContent(output.html);
    await page.locator("img").evaluate((image) => image.decode());
    await page.screenshot({
      path: fileURLToPath(new URL(output.file, publicDir)),
      omitBackground: !output.html.includes("background:#") && output.file !== "og-image.png",
    });
    await page.close();
    console.log(`wrote public/${output.file}`);
  }
} finally {
  await browser.close();
}
