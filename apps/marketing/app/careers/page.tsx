import type { Metadata } from "next";
import { CtaBand, PageHero } from "@/components/ui";
import { CAREERS, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Careers — Build the AI operations team for behavioral health",
  description:
    "Join Cura. We're building specialized AI agents that give behavioral health practices their time back.",
  alternates: { canonical: "/careers" },
};

export default function Page() {
  return (
    <main>
      <PageHero
        eyebrow="Careers"
        title="Give clinicians their time back."
        body="We're a small team building the AI operations layer for behavioral health. If that mission resonates, we'd love to talk."
      />

      <section className="mx-auto max-w-container px-6 py-16">
        <ul className="divide-y divide-line rounded-xl border border-line bg-bg-800/40">
          {CAREERS.map((job) => (
            <li key={job.role} className="flex flex-wrap items-center justify-between gap-3 p-6">
              <div>
                <div className="text-base font-semibold text-text-hi">{job.role}</div>
                <div className="mt-1 text-sm text-text-mid">
                  {job.team} · {job.location}
                </div>
              </div>
              <a
                href={`mailto:${SITE.email}?subject=${encodeURIComponent(job.role)}`}
                className="rounded-pill border border-line px-4 py-2 text-xs uppercase tracking-wider text-text-hi hover:border-line-strong"
              >
                Apply
              </a>
            </li>
          ))}
        </ul>
      </section>

      <CtaBand />
    </main>
  );
}
