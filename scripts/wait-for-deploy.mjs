// Wait until a deployed site serves the build stamp for an expected commit.
// GitHub Pages reports a deploy as finished before every edge serves it, and its
// files are HTTP-cacheable for ten minutes, so smoke tests must not start early.
//
//   node scripts/wait-for-deploy.mjs <base-url> <commit> [timeout-seconds]
const [baseUrl, expected, timeoutSeconds = "600"] = process.argv.slice(2);
if (!baseUrl || !expected) {
  console.error("usage: node scripts/wait-for-deploy.mjs <base-url> <commit> [timeout-seconds]");
  process.exit(2);
}

const stampUrl = new URL("version.json", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
const deadline = Date.now() + Number(timeoutSeconds) * 1000;
let last = "no response";

while (Date.now() < deadline) {
  try {
    // A query string sidesteps intermediary caches of the previous stamp.
    const response = await fetch(`${stampUrl.href}?t=${Date.now()}`, { cache: "no-store" });
    if (response.ok) {
      const info = await response.json();
      if (info.commit === expected) {
        console.log(
          `Deployed: version ${info.version}, commit ${info.commit}, offline cache ${info.cacheVersion}`,
        );
        process.exit(0);
      }
      last = `serving commit ${info.commit}`;
    } else {
      last = `HTTP ${response.status}`;
    }
  } catch (error) {
    last = error.message;
  }
  await new Promise((resolve) => setTimeout(resolve, 10_000));
}

console.error(`${stampUrl.href} did not serve commit ${expected} within ${timeoutSeconds}s (last: ${last}).`);
process.exit(1);
