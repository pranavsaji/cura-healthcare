"use client";

import { useEffect } from "react";

/**
 * Progressive smooth-scroll enhancement. Rather than pull in a JS scroll-hijack
 * library (which fights the browser and hurts a11y), we enable native CSS
 * `scroll-behavior: smooth` — but ONLY when the user has not asked for reduced
 * motion. This is buttery, dependency-free, and never blocks first paint: the
 * class is added after hydration, so SSR output has no motion baked in.
 *
 * Asserting this behaviour: the e2e reduced-motion test checks that
 * `<html>` does NOT get `data-smooth` when `prefers-reduced-motion: reduce`.
 */
export function SmoothScroll() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    const apply = () => {
      if (mq.matches) {
        root.removeAttribute("data-smooth");
        root.style.scrollBehavior = "auto";
      } else {
        root.setAttribute("data-smooth", "true");
        root.style.scrollBehavior = "smooth";
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      root.removeAttribute("data-smooth");
      root.style.scrollBehavior = "";
    };
  }, []);
  return null;
}
