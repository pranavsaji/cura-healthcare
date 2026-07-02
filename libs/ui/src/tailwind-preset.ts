import type { Config } from "tailwindcss";

/**
 * Shared Tailwind preset mapping the CSS design tokens to utility classes.
 * Both apps/web and apps/marketing extend this so the language stays identical.
 */
const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        bg: {
          900: "var(--bg-900)",
          800: "var(--bg-800)",
          700: "var(--bg-700)",
          600: "var(--bg-600)",
        },
        line: { DEFAULT: "var(--line)", strong: "var(--line-strong)" },
        cream: { 100: "var(--cream-100)", 200: "var(--cream-200)" },
        ink: { 900: "var(--ink-900)", 600: "var(--ink-600)" },
        sage: { 500: "var(--sage-500)" },
        mint: { 400: "var(--mint-400)", 500: "var(--mint-500)" },
        amber: { 400: "var(--amber-400)" },
        lime: { 400: "var(--lime-400)" },
        danger: "var(--danger)",
        text: {
          hi: "var(--text-hi)",
          mid: "var(--text-mid)",
          lo: "var(--text-lo)",
        },
      },
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
        pill: "var(--r-pill)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        glow: "var(--shadow-glow)",
        lift: "var(--shadow-lift)",
      },
      fontFamily: {
        display: "var(--font-display)",
        text: "var(--font-text)",
        mono: "var(--font-mono)",
      },
      maxWidth: { container: "var(--container)" },
      transitionTimingFunction: { expo: "var(--ease-expo)" },
      keyframes: {
        "blur-in": {
          "0%": { opacity: "0", filter: "blur(12px)", transform: "translateY(12px)" },
          "100%": { opacity: "1", filter: "blur(0)", transform: "translateY(0)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        pulse_glow: {
          "0%,100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "blur-in": "blur-in 0.7s var(--ease-expo) both",
        marquee: "marquee 40s linear infinite",
        "pulse-glow": "pulse_glow 2s ease-in-out infinite",
      },
    },
  },
};

export default preset;
