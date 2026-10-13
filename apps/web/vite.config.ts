import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset paths let the static build run from any host or subpath.
  base: "./",
  resolve: {
    // The workspace packages publish from dist/; the app reads their source directly so it never needs a prior build.
    alias: {
      "@tieout/sdk": fileURLToPath(new URL("../../packages/sdk/src/index.ts", import.meta.url)),
      "@tieout/recon": fileURLToPath(new URL("../../packages/recon/src/index.ts", import.meta.url)),
    },
  },
});
