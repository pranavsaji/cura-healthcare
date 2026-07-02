import Link from "next/link";
import type { ReactNode } from "react";

/** Small labelled eyebrow used above headings across the site. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-text-mid">
      <span className="h-1 w-1 rounded-full bg-mint-400 shadow-glow" />
      {children}
    </span>
  );
}

/** Standard page hero for product + supporting pages. */
export function PageHero({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <section className="hero-wash grain relative overflow-hidden">
      <div className="mx-auto max-w-container px-6 pb-16 pt-40">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-6 max-w-3xl font-display text-5xl font-light leading-[1.05] tracking-tight text-text-hi md:text-6xl">
          {title}
        </h1>
        <p className="mt-6 max-w-xl text-lg text-text-mid">{body}</p>
      </div>
    </section>
  );
}

export function FeatureGrid({ features }: { features: { title: string; body: string }[] }) {
  return (
    <div className="mt-10 grid gap-4 md:grid-cols-2">
      {features.map((f) => (
        <div key={f.title} className="rounded-xl border border-line bg-bg-800/40 p-6">
          <h3 className="text-base font-semibold text-text-hi">{f.title}</h3>
          <p className="mt-2 text-sm text-text-mid">{f.body}</p>
        </div>
      ))}
    </div>
  );
}

export function CtaBand() {
  return (
    <section className="mx-auto max-w-container px-6 pb-28 pt-16 text-center">
      <h2 className="mx-auto max-w-2xl font-display text-4xl font-light text-text-hi md:text-5xl">
        Bring focus back to care.
      </h2>
      <p className="mt-4 text-text-mid">How your practice was always meant to be run.</p>
      <Link
        href="/book-a-demo"
        className="mt-8 inline-block rounded-pill bg-mint-400 px-7 py-3 text-sm font-medium text-ink-900 shadow-glow hover:bg-mint-500"
      >
        Book a demo →
      </Link>
    </section>
  );
}
