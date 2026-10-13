import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@tallypay/sdk": fileURLToPath(new URL("./packages/sdk/src/index.ts", import.meta.url)),
      "@tallypay/recon": fileURLToPath(new URL("./packages/recon/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
  },
});
