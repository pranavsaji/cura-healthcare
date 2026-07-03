import Link from "next/link";
import { FlowLine } from "@/components/FlowLine";
import { Marquee } from "@/components/Marquee";
import { Reveal } from "@/components/Reveal";
import { HeroScene } from "@/components/HeroScene";
import { TiltCard } from "@/components/TiltCard";
import { Eyebrow } from "@/components/ui";
import { COMPLIANCE, EHRS, MODALITIES, PRODUCTS, CURA_LOOP } from "@/lib/site";

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display text-3xl font-light text-text-hi">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-text-mid">{label}</div>
    </div>
  );
}

export default function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="hero-wash grain relative overflow-hidden">
        <div className="mx-auto grid max-w-container items-center gap-8 px-6 pb-24 pt-44 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <Eyebrow>The AI operations team for behavioral health</Eyebrow>
            <h1 className="mt-6 max-w-4xl font-display text-6xl font-light leading-[1.05] tracking-tight text-text-hi md:text-7xl">
              Ambient agents for behavioral health operations
            </h1>
            <p className="mt-6 max-w-xl text-lg text-text-mid">
              Specialized AI agents that run front-desk, documentation, and RCM operations —
              inside your existing software stack.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link href="/book-a-demo" className="rounded-pill bg-mint-400 px-6 py-3 text-sm font-medium text-ink-900 shadow-glow transition-transform hover:-translate-y-0.5 hover:bg-mint-500">
                Request demo →
              </Link>
              <a href="#products" className="text-sm text-text-mid underline-offset-4 hover:text-text-hi hover:underline">
                See the platform
              </a>
            </div>
            <div className="mt-20 flex items-center gap-12">
              <Stat value="6,000+" label="Clinics" />
              <Stat value="30+" label="States" />
              <Stat value="Enterprise" label="Grade security" />
            </div>
          </div>
          {/* Signature 3D hero scene — gated + client-only inside HeroScene */}
          <div className="relative mx-auto hidden aspect-square w-full max-w-[520px] lg:block">
            <HeroScene />
          </div>
        </div>
      </section>

      {/* Platform / flow line */}
      <section id="products" className="mx-auto max-w-container px-6 py-20">
        <Reveal className="text-center">
          <Eyebrow>The platform</Eyebrow>
          <h2 className="mt-4 font-display text-4xl font-light text-text-hi md:text-5xl">
            One connected operations team.
          </h2>
          <p className="mt-3 text-text-mid">Start with one — or use all three together.</p>
        </Reveal>
        <div className="mt-8">
          <FlowLine />
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {PRODUCTS.map((p) => (
            <Link
              key={p.slug}
              href={`/${p.slug}`}
              className="rounded-lg border border-line bg-bg-700/50 px-5 py-4 text-center text-sm text-text-hi hover:border-line-strong"
            >
              {p.name} · {p.eyebrow}
            </Link>
          ))}
        </div>
      </section>

      {/* Product sections */}
      <section className="mx-auto max-w-container space-y-6 px-6 py-10">
        {PRODUCTS.map((p, i) => (
          <Reveal key={p.slug}>
            <div className="grid items-center gap-8 rounded-xl border border-line bg-bg-800/40 p-8 md:grid-cols-2">
              <div className={i % 2 ? "md:order-2" : ""}>
                <Eyebrow>{p.eyebrow}</Eyebrow>
                <h3 className="mt-4 font-display text-3xl font-light text-text-hi md:text-4xl">{p.headline}</h3>
                <p className="mt-4 max-w-md text-text-mid">{p.body}</p>
                <Link href={`/${p.slug}`} className="mt-6 inline-block text-sm text-mint-400 hover:underline">
                  Explore {p.name} →
                </Link>
              </div>
              <div className={i % 2 ? "md:order-1" : ""}>
                <TiltCard className="relative aspect-[4/3] overflow-hidden rounded-lg border border-line bg-gradient-to-br from-bg-700 to-bg-900 p-6 shadow-card">
                  <span className={`inline-flex items-center gap-2 rounded-pill border border-line bg-bg-800/80 px-3 py-1 text-[11px] uppercase tracking-wider ${p.tone}`}>
                    <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-current" />
                    {p.chip}
                  </span>
                  <div className="mt-6 space-y-3">
                    {[90, 70, 80, 55].map((w, j) => (
                      <div key={j} className="h-2.5 rounded bg-white/5" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                </TiltCard>
              </div>
            </div>
          </Reveal>
        ))}
      </section>

      {/* The Cura Loop */}
      <section className="mx-auto max-w-container px-6 py-20">
        <Reveal className="text-center">
          <Eyebrow>The Cura Loop</Eyebrow>
          <h2 className="mt-4 font-display text-4xl font-light text-text-hi md:text-5xl">
            Capture. Understand. Act. Learn.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-text-mid">
            One feedback loop across every vertical — each correction sharpens the next action.
          </p>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {CURA_LOOP.map((c, i) => (
            <Reveal key={c.step} delayMs={i * 80}>
              <div className="h-full rounded-xl border border-line bg-bg-800/40 p-6">
                <div className="font-display text-2xl text-mint-400">{c.step}</div>
                <div className="mt-3 text-base font-semibold text-text-hi">{c.title}</div>
                <p className="mt-2 text-sm text-text-mid">{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Domain-native */}
      <section className="bg-cream-100 py-20 text-ink-900">
        <div className="mx-auto max-w-container px-6 text-center">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-600">Domain-native</span>
          <h2 className="mt-4 font-display text-4xl font-light md:text-5xl">Purpose-built for behavioral health.</h2>
          <p className="mt-3 text-ink-600">Specifically trained for the clinical and billing nuances of behavioral health.</p>
        </div>
        <div className="mt-10">
          <Marquee items={MODALITIES} />
        </div>
      </section>

      {/* Integrations */}
      <section id="integrations" className="mx-auto max-w-container px-6 py-20 text-center">
        <Reveal>
          <Eyebrow>Integrations</Eyebrow>
          <h2 className="mx-auto mt-4 max-w-2xl font-display text-4xl font-light text-text-hi md:text-5xl">
            Works with your existing software stack.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-text-mid">
            You don’t need yet another AI-native EHR and a six-month migration. Cura agents log into your
            existing systems and start operating from day two.
          </p>
        </Reveal>
        <div className="mt-10">
          <Marquee items={EHRS} />
        </div>
        <Link href="/integrations" className="mt-8 inline-block text-sm text-mint-400 hover:underline">
          See all integrations →
        </Link>
      </section>

      {/* Security */}
      <section id="security" className="mx-auto max-w-container px-6 py-20">
        <Reveal className="text-center">
          <Eyebrow>Security</Eyebrow>
          <h2 className="mt-4 font-display text-4xl font-light text-text-hi md:text-5xl">Enterprise-grade from day one.</h2>
          <p className="mt-3 text-text-mid">Every action logged, every decision traceable.</p>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {COMPLIANCE.map(([title, body]) => (
            <div key={title} className="rounded-lg border border-line bg-bg-700/50 p-6">
              <div className="text-sm font-semibold text-text-hi">{title}</div>
              <p className="mt-2 text-sm text-text-mid">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link href="/security" className="text-sm text-mint-400 hover:underline">
            Read our security posture →
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section id="demo" className="mx-auto max-w-container px-6 pb-28 pt-10 text-center">
        <h2 className="mx-auto max-w-2xl font-display text-5xl font-light text-text-hi">Bring focus back to care.</h2>
        <p className="mt-4 text-text-mid">How your practice was always meant to be run.</p>
        <Link href="/book-a-demo" className="mt-8 inline-block rounded-pill bg-mint-400 px-7 py-3 text-sm font-medium text-ink-900 shadow-glow hover:bg-mint-500">
          Book a demo →
        </Link>
      </section>
    </main>
  );
}
