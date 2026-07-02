"use client";

import Link from "next/link";
import { useState } from "react";
import { NAV_LINKS } from "@/lib/site";

/**
 * Site navigation with a keyboard-accessible mobile menu. Links are real routes
 * (Next `<Link>`), so every page is reachable and crawlable. The mobile toggle is
 * a real `<button>` with `aria-expanded`/`aria-controls` for screen readers.
 */
export function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed inset-x-0 top-5 z-50 flex justify-center px-4">
      <nav
        aria-label="Primary"
        className="flex w-full max-w-5xl items-center justify-between rounded-pill border border-line bg-bg-800/70 px-6 py-3 backdrop-blur-xl"
      >
        <Link href="/" className="font-display text-lg tracking-tight text-text-hi">
          cura<span className="text-text-lo">.</span>
        </Link>

        <div className="hidden items-center gap-6 text-sm text-text-mid md:flex">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-text-hi">
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/book-a-demo"
            className="hidden rounded-pill border border-line px-4 py-1.5 text-xs uppercase tracking-wider text-text-hi hover:border-line-strong sm:inline-block"
          >
            Book a demo
          </Link>
          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="rounded-md border border-line px-3 py-1.5 text-text-hi md:hidden"
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </nav>

      {open && (
        <div
          id="mobile-menu"
          className="absolute top-20 w-[calc(100%-2rem)] max-w-5xl rounded-xl border border-line bg-bg-800/95 p-4 backdrop-blur-xl md:hidden"
        >
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2 text-text-mid hover:bg-bg-700 hover:text-text-hi"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/book-a-demo"
                onClick={() => setOpen(false)}
                className="mt-2 block rounded-md bg-mint-400 px-3 py-2 text-center font-medium text-ink-900"
              >
                Book a demo
              </Link>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
