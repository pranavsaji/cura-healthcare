import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { CtaBand, FeatureGrid, PageHero } from "@/components/ui";
import type { Product } from "@/lib/site";

/** One layout, three products — content-driven from the `Product` record. */
export function ProductPage({ product }: { product: Product }) {
  return (
    <main>
      <PageHero eyebrow={product.eyebrow} title={product.headline} body={product.body} />

      <section className="mx-auto max-w-container px-6 py-16">
        <Reveal>
          <div className="flex items-center gap-2 text-sm">
            <span className={`inline-flex items-center gap-2 rounded-pill border border-line bg-bg-800/80 px-3 py-1 text-[11px] uppercase tracking-wider ${product.tone}`}>
              <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-current" />
              {product.chip}
            </span>
          </div>
          <FeatureGrid features={product.features} />
        </Reveal>
      </section>

      <section className="mx-auto max-w-container px-6 pb-8">
        <Reveal className="rounded-xl border border-line bg-bg-800/40 p-8 text-center">
          <h2 className="font-display text-2xl font-light text-text-hi">
            Runs inside the tools you already use.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-text-mid">
            No migration, no rip-and-replace. {product.name} logs into your existing systems and
            starts operating from day two.
          </p>
          <Link href="/integrations" className="mt-6 inline-block text-sm text-mint-400 hover:underline">
            See integrations →
          </Link>
        </Reveal>
      </section>

      <CtaBand />
    </main>
  );
}
