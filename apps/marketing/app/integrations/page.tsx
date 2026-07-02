import type { Metadata } from "next";
import { Marquee } from "@/components/Marquee";
import { CtaBand, PageHero } from "@/components/ui";
import { EHRS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Integrations — Works with your existing stack",
  description:
    "Cura agents log into the EHR, scheduling, and billing tools you already run — TherapyNotes, SimplePractice, Valant, Kipu and more.",
  alternates: { canonical: "/integrations" },
};

export default function Page() {
  return (
    <main>
      <PageHero
        eyebrow="Integrations"
        title="Works with your existing software stack."
        body="No AI-native EHR, no six-month migration. Cura agents operate inside the systems you already run — starting day two."
      />

      <section className="py-12">
        <Marquee items={EHRS} />
      </section>

      <section className="mx-auto max-w-container px-6 pb-16">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {EHRS.map((name) => (
            <div key={name} className="rounded-lg border border-line bg-bg-700/50 px-5 py-4 text-sm text-text-hi">
              {name}
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-text-mid">
          Don’t see yours? Our assisted-paste fallback works with any system on day one.
        </p>
      </section>

      <CtaBand />
    </main>
  );
}
