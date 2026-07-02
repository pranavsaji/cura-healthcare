"use client";

import { SITE } from "@/lib/site";

/**
 * Book-a-demo widget. If a scheduler link is configured
 * (`NEXT_PUBLIC_CALCOM_LINK`, e.g. a Cal.com/Calendly URL), embed it in a titled
 * iframe. Otherwise degrade gracefully to a direct email CTA — the page always
 * works, with or without the third-party embed. Config over hardcoding.
 */
export function DemoBooking() {
  const link = process.env.NEXT_PUBLIC_CALCOM_LINK;

  if (link) {
    return (
      <div className="overflow-hidden rounded-xl border border-line bg-bg-800/40">
        <iframe
          src={link}
          title="Book a demo with Cura"
          className="h-[640px] w-full"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-bg-800/40 p-8 text-center">
      <p className="text-text-mid">
        Email us and we’ll find a time that works. Include your practice size and current EHR.
      </p>
      <a
        href={`mailto:${SITE.email}?subject=${encodeURIComponent("Book a demo")}`}
        className="mt-6 inline-block rounded-pill bg-mint-400 px-7 py-3 text-sm font-medium text-ink-900 shadow-glow hover:bg-mint-500"
      >
        Email {SITE.email} →
      </a>
    </div>
  );
}
