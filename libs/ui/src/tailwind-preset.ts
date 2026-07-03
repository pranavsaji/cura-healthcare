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
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        breathe: {
          "0%,100%": { transform: "scale(1)", opacity: "0.85" },
          "50%": { transform: "scale(1.04)", opacity: "1" },
        },
        sheen: {
          "0%": { transform: "translateX(-120%) skewX(-12deg)" },
          "100%": { transform: "translateX(220%) skewX(-12deg)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        comet: {
          "0%": { transform: "translateX(0)", opacity: "0" },
          "10%,90%": { opacity: "1" },
          "100%": { transform: "translateX(var(--comet-travel, 100%))", opacity: "0" },
        },
      },
      animation: {
        "blur-in": "blur-in 0.7s var(--ease-expo) both",
        marquee: "marquee 40s linear infinite",
        "pulse-glow": "pulse_glow 2s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        breathe: "breathe 4s ease-in-out infinite",
        sheen: "sheen 2.5s var(--ease-expo) infinite",
        shimmer: "shimmer 2.2s linear infinite",
        comet: "comet 2.4s var(--ease-expo) infinite",
      },
    },
  },
};

export default preset;
