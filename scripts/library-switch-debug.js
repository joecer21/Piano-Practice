import http from "http";
import handler from "serve-handler";
import puppeteer from "puppeteer";

async function withServer(root, fn) {
  const server = http.createServer((request, response) => {
    return handler(request, response, { public: root });
  });
  const port = 4173;
  await new Promise((resolve) => server.listen(port, resolve));
  try {
    await fn(`http://127.0.0.1:${port}/index.html`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const args = process.argv.slice(2);
const targetIdArg = args.find((arg) => arg.startsWith("--target="));
const targetLibraryId = targetIdArg ? targetIdArg.split("=")[1] : "local-bright";
const immediateSwitch = args.includes("--immediate");

async function run() {
  await withServer(process.cwd(), async (url) => {
    const browser = await puppeteer.launch({ headless: "new" });
    try {
      const page = await browser.newPage();
      page.on("console", (msg) => {
        console.log("[browser]", msg.type(), msg.text());
      });
      page.on("pageerror", (err) => {
        console.error("[pageerror]", err);
      });

      console.log("Loading", url);
      await page.goto(url, { waitUntil: "networkidle2" });

      await page.waitForFunction(() => !!window.__samplerSnapshot, { timeout: 60000 });
      const initialSnapshot = await page.evaluate(() => window.__samplerSnapshot);
      console.log("Initial sampler snapshot:", JSON.stringify(initialSnapshot, null, 2));

      if (!immediateSwitch) {
        await page.waitForFunction(() => {
          const snap = window.__samplerSnapshot;
          if (!snap) return false;
          const defaults = Object.values(snap.libraries || {}).filter((entry) => entry.isDefault);
          return defaults.some((entry) => entry.phase === "ready");
        }, { timeout: 60000 });
        console.log("Default piano ready");
      } else {
        console.log("Skipping default-ready wait (immediate switch mode)");
      }

      await page.select("#piano-model", targetLibraryId);
      console.log(`Selected ${targetLibraryId}`);

      await page
        .waitForFunction(
          (target) => {
            const snap = window.__samplerSnapshot;
            if (!snap) return false;
            const entry = snap.libraries?.[target];
            return entry?.phase === "ready" && snap.activeLibraryId === target;
          },
          { timeout: 60000 },
          targetLibraryId
        )
        .catch((err) => console.warn("Timed waiting for target ready", err.message));

      const finalSnapshot = await page.evaluate(() => window.__samplerSnapshot);
      console.log("Final sampler snapshot:", JSON.stringify(finalSnapshot, null, 2));
    } finally {
      await browser.close();
    }
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
