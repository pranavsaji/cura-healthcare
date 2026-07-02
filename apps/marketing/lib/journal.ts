/**
 * Journal content collection (SEO engine). Posts are a typed data collection so
 * the build is deterministic and dependency-free — no runtime MDX toolchain. Each
 * post carries the metadata the OG image + JSON-LD + sitemap need. Adding a post
 * is appending an entry here (content-driven, Phase 15 mandate).
 *
 * Deviation note (handoff): the spec suggested MDX files. We use a typed block
 * collection instead to keep `next build` hermetic and fast; swapping to MDX later
 * is a drop-in change behind `getAllPosts`/`getPost`.
 */

export type Block =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] };

export interface JournalPost {
  slug: string;
  title: string;
  description: string;
  /** ISO date (YYYY-MM-DD) — stable, no runtime clock. */
  date: string;
  author: string;
  readingMinutes: number;
  tags: string[];
  body: Block[];
}

const POSTS: JournalPost[] = [
  {
    slug: "ambient-documentation-behavioral-health",
    title: "Why ambient documentation belongs in behavioral health first",
    description:
      "Behavioral health notes are narrative, high-context, and time-consuming. That is exactly where ambient AI documentation pays off fastest.",
    date: "2026-05-12",
    author: "Cura Team",
    readingMinutes: 6,
    tags: ["Curanote", "Clinical"],
    body: [
      { type: "p", text: "Behavioral health clinicians spend hours after each session turning a rich, human conversation into a structured note. Unlike a 12-minute primary-care visit, a therapy session is narrative by nature — and that narrative is exactly what payers, auditors, and the next clinician need." },
      { type: "h2", text: "The documentation tax" },
      { type: "p", text: "Every minute spent writing SOAP or DAP notes is a minute not spent with a client. Ambient documentation removes that tax by listening with consent, structuring the session, and drafting a clinician-ready note before the next patient walks in." },
      { type: "ul", items: [
        "Consent precedes every capture — no audio is ingested without a logged consent event.",
        "Notes are drafts, not decisions: the clinician always reviews and signs.",
        "Risk flags are surfaced for review, never auto-acted upon.",
      ] },
      { type: "h2", text: "Evidence, not hallucination" },
      { type: "p", text: "Each generated section links back to the transcript evidence it came from, so a clinician can verify a claim in one click. That traceability is what makes AI documentation trustworthy in a regulated setting." },
    ],
  },
  {
    slug: "front-desk-agents-answer-in-two-seconds",
    title: "The two-second answer: front-desk voice agents that never miss a lead",
    description:
      "A missed call is a missed patient. We break down the low-latency voice pipeline behind sub-two-second answers.",
    date: "2026-06-03",
    author: "Cura Team",
    readingMinutes: 7,
    tags: ["Curadesk", "Voice"],
    body: [
      { type: "p", text: "In behavioral health, the moment a prospective client works up the courage to call is fragile. If no one answers, they may never call back. Front-desk voice agents change the math: they answer every call, instantly." },
      { type: "h2", text: "Why latency is the product" },
      { type: "p", text: "Under two seconds is not a vanity metric — it is the difference between a natural conversation and an awkward one. Getting there means streaming speech-to-text into an agent loop and speech synthesis back out, with barge-in so callers can interrupt like they would with a person." },
      { type: "ul", items: [
        "Streaming STT feeds partial transcripts to the agent as the caller speaks.",
        "Endpointing decides when the caller is actually done.",
        "Barge-in lets the caller cut off the agent mid-sentence.",
      ] },
      { type: "h2", text: "Qualify, schedule, verify" },
      { type: "p", text: "Answering is table stakes. The agent then qualifies the referral, books an appointment through your existing scheduler, and verifies benefits — every side-effect gated and audited." },
    ],
  },
  {
    slug: "catch-denials-before-they-happen",
    title: "Catching denials before they happen with a payer-rules engine",
    description:
      "The cheapest denial is the one you never file. How a per-payer rules engine flags issues before a claim is submitted.",
    date: "2026-06-24",
    author: "Cura Team",
    readingMinutes: 8,
    tags: ["Curabill", "RCM"],
    body: [
      { type: "p", text: "Denial management is mostly cleanup after a preventable mistake. The highest-leverage move in revenue-cycle management is to catch the issue before the claim ever leaves the building." },
      { type: "h2", text: "Rules first, prediction second" },
      { type: "p", text: "A per-payer rules engine encodes the deterministic requirements — authorization windows, modifier rules, place-of-service constraints — and blocks a claim that would obviously bounce. On top of that, a denial-prediction model scores the fuzzier risk." },
      { type: "ul", items: [
        "Pre-submission checks flag known pre-denial conditions.",
        "CARC/RARC mapping turns cryptic denial codes into plain-language next steps.",
        "A learning loop sharpens per-tenant rules after every accept/deny outcome.",
      ] },
      { type: "h2", text: "No money moves without a human" },
      { type: "p", text: "Every claim submission and payment posting is gated behind a recorded human approval and fully audited. The agent drafts; a person decides." },
    ],
  },
];

export function getAllPosts(): JournalPost[] {
  // Newest first, deterministic string sort on ISO dates.
  return [...POSTS].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function getPost(slug: string): JournalPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}

export function allSlugs(): string[] {
  return POSTS.map((p) => p.slug);
}
