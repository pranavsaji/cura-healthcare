import Link from "next/link";
import { FOOTER_GROUPS, SITE } from "@/lib/site";

/** Global footer with the full sitemap of routes for crawlability + navigation. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-bg-900">
      <div className="mx-auto grid max-w-container gap-10 px-6 py-14 md:grid-cols-4">
        <div>
          <div className="font-display text-lg text-text-hi">
            cura<span className="text-text-lo">.</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-text-mid">{SITE.tagline}.</p>
        </div>
        {FOOTER_GROUPS.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-mid">
              {group.title}
            </div>
            <ul className="mt-4 space-y-2 text-sm text-text-mid">
              {group.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-text-hi">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line py-6 text-center text-xs text-text-mid">
        © 2026 {SITE.name} · The AI operations team for behavioral health · Built as an architecture demo.
      </div>
    </footer>
  );
}
