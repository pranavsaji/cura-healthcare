import type { Metadata } from "next";
import { Reveal } from "@/components/Reveal";
import { CtaBand, PageHero } from "@/components/ui";
import { COMPLIANCE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Security — Enterprise-grade from day one",
  description:
    "HIPAA, SOC 2 Type II, ISO 27001 and GDPR posture. Every action is logged in a hash-chained audit trail; PHI is encrypted in transit and at rest.",
  alternates: { canonical: "/security" },
};

const CONTROLS = [
  { title: "Encryption everywhere", body: "TLS in transit, AES-256 at rest, and application-layer envelope encryption for PII columns." },
  { title: "Hash-chained audit", body: "Every PHI-touching action emits an immutable, tamper-evident audit event carrying orgId, actor, and resource." },
  { title: "Minimum-necessary access", body: "Role-based access control with strict tenant isolation — no query runs without a tenant scope." },
  { title: "PHI-free telemetry", body: "Loggers redact known PHI fields by default; an automated scan blocks PHI from reaching logs." },
  { title: "BAAs before real data", body: "No real subprocessor touches PHI without a signed BAA; mock providers are the only path until then." },
  { title: "Retention & deletion", body: "Configurable retention with auditable hard-delete jobs honoring each organization's policy." },
];

export default function Page() {
  return (
    <main>
      <PageHero
        eyebrow="Security"
        title="Enterprise-grade from day one."
        body="Built for PHI from the first line of code. Every action logged, every decision traceable."
      />

      <section className="mx-auto max-w-container px-6 py-16">
        <div className="grid gap-4 md:grid-cols-4">
          {COMPLIANCE.map(([title, body]) => (
            <div key={title} className="rounded-lg border border-line bg-bg-700/50 p-6">
              <div className="text-sm font-semibold text-text-hi">{title}</div>
              <p className="mt-2 text-sm text-text-mid">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-container px-6 pb-16">
        <Reveal>
          <div className="grid gap-4 md:grid-cols-2">
            {CONTROLS.map((c) => (
              <div key={c.title} className="rounded-xl border border-line bg-bg-800/40 p-6">
                <h3 className="text-base font-semibold text-text-hi">{c.title}</h3>
                <p className="mt-2 text-sm text-text-mid">{c.body}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <CtaBand />
    </main>
  );
}
