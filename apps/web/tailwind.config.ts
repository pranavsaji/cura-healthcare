import type { Config } from "tailwindcss";
import preset from "../../libs/ui/src/tailwind-preset.js";

export default {
  presets: [preset as Config],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../libs/ui/src/**/*.{ts,tsx}",
  ],
} satisfies Config;
