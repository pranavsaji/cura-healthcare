/**
 * Content-driven site config. Pages render from these arrays so the site scales
 * without bespoke per-page code (Phase 15 mandate). No PHI ever lives here — this
 * app never touches patient data.
 */

export const SITE = {
  name: "Cura",
  domain: "https://heycura.com",
  tagline: "Ambient agents for behavioral health operations",
  description:
    "Specialized AI agents that run front-desk, documentation, and RCM operations — inside your existing software stack.",
  email: "hello@heycura.com",
} as const;

export interface NavLink {
  href: string;
  label: string;
}

/** Primary nav — real routes, not hash anchors, so every page is reachable. */
export const NAV_LINKS: NavLink[] = [
  { href: "/curanote", label: "Curanote" },
  { href: "/curadesk", label: "Curadesk" },
  { href: "/curabill", label: "Curabill" },
  { href: "/integrations", label: "Integrations" },
  { href: "/security", label: "Security" },
  { href: "/journal", label: "Journal" },
];

export const FOOTER_GROUPS: { title: string; links: NavLink[] }[] = [
  {
    title: "Products",
    links: [
      { href: "/curanote", label: "Curanote · Documentation" },
      { href: "/curadesk", label: "Curadesk · Front desk" },
      { href: "/curabill", label: "Curabill · RCM" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/security", label: "Security" },
      { href: "/integrations", label: "Integrations" },
      { href: "/careers", label: "Careers" },
      { href: "/journal", label: "Journal" },
    ],
  },
  {
    title: "Get started",
    links: [
      { href: "/book-a-demo", label: "Book a demo" },
      { href: `mailto:${SITE.email}`, label: SITE.email },
    ],
  },
];

export interface Product {
  slug: "curanote" | "curadesk" | "curabill";
  name: string;
  eyebrow: string;
  headline: string;
  body: string;
  tone: string;
  chip: string;
  features: { title: string; body: string }[];
}

export const PRODUCTS: Product[] = [
  {
    slug: "curadesk",
    name: "Curadesk",
    eyebrow: "Front-desk operations",
    headline: "Never miss a lead again.",
    body: "Front-desk agents that answer calls, qualify referrals, schedule appointments, and verify benefits — across phones, web, and existing scheduling tools. Responds in under 2 seconds.",
    tone: "text-mint-400",
    chip: "Incoming call · connecting",
    features: [
      { title: "Sub-2-second answer", body: "Voice agents pick up instantly, day or night, so no referral goes to voicemail." },
      { title: "Referral qualification", body: "Captures insurance, level of care, and urgency, then routes to the right queue." },
      { title: "Scheduling & benefits", body: "Books appointments and verifies eligibility inside the tools you already run." },
      { title: "Barge-in aware", body: "Callers can interrupt naturally; the agent yields the floor like a person would." },
    ],
  },
  {
    slug: "curanote",
    name: "Curanote",
    eyebrow: "Ambient documentation",
    headline: "Notes that write themselves.",
    body: "Ambient documentation that listens, structures, and writes clinician-ready notes directly into your EHR — before the next patient walks in. SOAP, DAP, BIRP, GIRP and custom formats.",
    tone: "text-amber-400",
    chip: "Listening · session #2147",
    features: [
      { title: "Ambient capture", body: "Consent-gated recording with live partial transcripts and speaker diarization." },
      { title: "Every note format", body: "SOAP, DAP, BIRP, GIRP, and custom templates with evidence linking." },
      { title: "Writes to your EHR", body: "Pushes the signed note into TherapyNotes, SimplePractice, Valant and more." },
      { title: "Risk scanning", body: "Surfaces safety flags for clinician review — never auto-acts on them." },
    ],
  },
  {
    slug: "curabill",
    name: "Curabill",
    eyebrow: "RCM operations",
    headline: "Fewer denials. Faster follow-up.",
    body: "Billing agents that submit claims, follow up with payers, and catch issues before they become denials — all inside the systems you already use. Pre-trained on 5,000+ payers.",
    tone: "text-sage-500",
    chip: "Workflow · benefits → claims → denials",
    features: [
      { title: "Pre-denial checks", body: "Payer-rules engine flags issues before a claim is ever submitted." },
      { title: "X12 837 / 835", body: "Builds compliant claims and parses remittances end to end." },
      { title: "Denial prediction", body: "CARC/RARC-aware model drafts appeals and follow-ups automatically." },
      { title: "Human-gated money", body: "Every money-moving action requires a recorded human approval." },
    ],
  },
];

/** The four cards of "the Cura Loop" — one connected operations team. */
export const CURA_LOOP = [
  { step: "01", title: "Capture", body: "Calls, sessions, and encounters flow in through one platform." },
  { step: "02", title: "Understand", body: "Domain-native agents structure the moment into clean data." },
  { step: "03", title: "Act", body: "Notes, schedules, and claims are written into your existing tools." },
  { step: "04", title: "Learn", body: "Every correction sharpens the next action — zero repeat mistakes." },
] as const;

export const MODALITIES = [
  "IOP", "PHP", "Outpatient Psychiatry", "MAT", "Detox", "SUD",
  "Residential Treatment", "Ketamine Clinics", "Eating Disorder Clinics",
];

export const EHRS = [
  "TherapyNotes", "SimplePractice", "Valant", "Kipu", "Ensora", "Qualifacts",
  "NextGen", "AdvancedMD", "BestNotes", "Sigmund", "Athena", "Cerner",
];

export const COMPLIANCE = [
  ["HIPAA", "Built for PHI from day one. Minimum-necessary access, BAA available."],
  ["SOC 2 Type II", "Independently audited security controls."],
  ["ISO 27001", "Enterprise information security management, end-to-end."],
  ["GDPR", "Data-subject rights, lawful processing, EU residency on request."],
] as const;

export const CAREERS = [
  { role: "Founding Voice Engineer", team: "Curadesk", location: "Remote (US)" },
  { role: "Clinical NLP Lead", team: "Curanote", location: "Remote (US)" },
  { role: "RCM Domain Expert", team: "Curabill", location: "Remote (US)" },
  { role: "Security & Compliance Lead", team: "Platform", location: "Remote (US)" },
] as const;
