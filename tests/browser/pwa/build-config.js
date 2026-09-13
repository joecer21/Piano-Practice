// Builds the real application as a distinguishable "deployed version" for the
// service-worker lifecycle tests. PWA_TEST_LABEL changes the application chunk's
// contents, and so its hashed file name and the precache version, exactly as a
// real deploy would; nothing else about the build differs.
import base from "../../../vite.config.js";

const label = process.env.PWA_TEST_LABEL ?? "a";

export default {
  ...base,
  logLevel: "warn",
  plugins: [
    ...base.plugins,
    {
      name: "pwa-test-label",
      transform(code, id) {
        if (!id.replaceAll("\\", "/").endsWith("/main.js")) return null;
        return `${code}\nglobalThis.__PWA_TEST_LABEL__ = ${JSON.stringify(label)};\n`;
      },
    },
  ],
};
