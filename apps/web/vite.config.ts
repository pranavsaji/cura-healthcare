import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  resolve: {
    // More specific aliases MUST come first — the CSS subpath before the package root.
    alias: [
      {
        find: "@cura/ui/tokens.css",
        replacement: fileURLToPath(new URL("../../libs/ui/src/tokens.css", import.meta.url)),
      },
      {
        find: "@cura/ui/three",
        replacement: fileURLToPath(new URL("../../libs/ui/src/three/index.ts", import.meta.url)),
      },
      {
        find: "@cura/shared",
        replacement: fileURLToPath(new URL("../../libs/shared/src/index.ts", import.meta.url)),
      },
      {
        find: "@cura/ui",
        replacement: fileURLToPath(new URL("../../libs/ui/src/index.ts", import.meta.url)),
      },
    ],
  },
});
