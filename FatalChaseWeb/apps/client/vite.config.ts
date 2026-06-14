import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  resolve: {
    alias: {
      "@fatal-chase/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url))
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
