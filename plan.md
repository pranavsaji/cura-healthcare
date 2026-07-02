# Cura Clone — Full Product, Architecture & Design Build Plan

> **Goal:** Build the *same product* as Cura (heycura.com / curanote.ai) — an ambient-AI
> operations platform for behavioral-health clinics — with a **UI that is more powerful and
> better-looking than the original**. This document is the complete requirements + architecture
> + design spec: research → what to build → how to build it → how it should look.
>
> Anchor the build on the **AI scribe (Curanote)** vertical first, on an architecture that lets
> **Front Desk (Curadesk)** and **RCM/Billing (Curabill)** plug into the same platform.

---

## 0. TL;DR for a builder

- **What it is:** Three "ambient AI agents" that operate *inside a clinic's existing software*
  (EHR, phone, scheduler, clearinghouse): **Curadesk** (front desk), **Curanote** (documentation),
  **Curabill** (RCM/claims). Shared platform: identity, memory, audit, integrations, learning loop.
- **Wedge:** Curanote — records a therapy session, transcribes live, writes a structured progress
  note in the clinician's exact format, syncs into the EHR "before the next patient walks in."
- **Stack we'll use (mirrors theirs):** TypeScript · React (Vite) · Node/**Fastify** · **WebSockets** ·
  **PostgreSQL** · **Drizzle ORM** · **Nx** monorepo · **WorkOS** (auth/SSO/SCIM) · **LLM/agentic AI**
  (Claude for note-drafting) · streaming ASR (Deepgram/AssemblyAI) · Temporal/BullMQ for durable jobs.
- **Design North Star:** the dark, cinematic, "calm-tech" aesthetic Cura uses — but sharper:
  crisper type, a real design-token system, buttery scroll motion, and a genuinely usable product UI
  (not just a marketing site). See §10–§11.
- **First milestone:** Curanote MVP — record → live transcript → note draft → editable note → copy/sync.
  Get it in front of 3–5 therapist design partners in ~6 weeks.

---

## 1. Company & product research (what Cura actually does)

### 1.1 Positioning
Cura (formerly **Curahealth**; heycura.com) sells **"Ambient Agents for Behavioral Health
Operations"** — *"Specialized AI Agents that run front-desk, documentation and RCM operations —
inside your existing software stack."* Founded 2025, ~11 people, **$5M from Peak XV** (ex–Sequoia
India). Traction claims: **6,000+ clinics, 30+ states.** The consumer-facing scribe brand is
**curanote.ai** ("AI Therapy Notes for Mental Health Providers").

Core narrative: **don't rip-and-replace the EHR.** Agents "log into your existing systems and start
operating from day-two — just like hiring a team trained on your context." Fluency in **24 hours,
0 manual training.**

### 1.2 The three product verticals

**A) Curadesk — Front-Desk Operations** ("Never miss a lead again.")
- AI voice agents that **answer inbound calls, qualify referrals, schedule appointments, verify
  benefits** — across phone, web, and existing scheduling tools.
- Hard SLA on the site: **responds in <2 seconds.** Live try-it phone number.
- Surfaces: incoming-call card → "Connecting with patient / Identifying caller / Looking up record."

**B) Curanote — Ambient Documentation** ("Notes that write themselves.")
- **Listens** to the live session, **structures**, and **writes clinician-ready notes directly into
  the EHR** before the next patient. Telehealth + in-person.
- From curanote.ai, the full scribe feature set:
  - **Note formats:** SOAP, DAP, GIRP, BIRP, SIRP, PIRP, PIE, + **custom templates**.
  - **20+ therapy modalities** understood: CBT, DBT, EMDR, IFS, etc.
  - **Personalization engine:** learns the clinician's voice/tone/terminology from **one session**.
  - **Inputs:** record live, **dictate**, or **upload audio**.
  - **EHR one-click sync** via a proprietary **"Super Fill"** button.
  - Reduces documentation time by up to **~80%**.
  - Compliance: HIPAA, **PHIPA, PIPEDA**, GDPR; encrypted in transit + at rest; signed **BAA**.

**C) Curabill — RCM & Billing** ("Fewer denials. Faster follow-up.")
- Agents **submit claims, follow up with payers, and catch issues before they become denials** —
  inside existing billing systems.
- Pipeline surfaced as stages: **Benefits Verification → Claims Processing → Denials Management**,
  each with a live status (`PROCESSING / WAITING / STANDBY`) and a `WORKFLOW · %` progress bar.
- Pre-trained on **5,000+ payers**, claim codes, authorization rules, denial patterns.
- Outcome claim (curahealth): eligibility + claims + denials + payment posting → "**20+ hours saved
  weekly**," higher collections.

### 1.3 The platform layer ("The Cura Loop") — the real moat
1. **Built-in expertise (Day 0):** agents ship as BH experts — 5,000+ payers, claim codes, auth rules.
2. **Practice context (24 hrs):** connect to the stack; learn census, providers, service mix, claims
   volume, payers, most-common denials — **0 manual training.**
3. **Continuous learning:** "Every approval, rejection, and correction is remembered — and applied
   next time without being asked." → **0 repeat mistakes.**
4. **Natural-language management:** teach agents in plain English ("We now require 48 hours' notice to
   cancel") → they update memory, understand implications, change behavior, **all agents at once.**

### 1.4 Integrations (breadth is the barrier to entry)
Agents connect to: **EHR, Phone, Calendar, Payer portals, Files.** Named EHRs/software:
**TherapyNotes, SimplePractice, Valant, Kipu, Ensora, Qualifacts, NextGen Healthcare, AdvancedMD,
BestNotes, Sigmund, Athenahealth, Cerner.** Segments served: **IOP, PHP, Outpatient Psychiatry, MAT,
Detox, SUD, Residential Treatment Centers, Ketamine Clinics, Eating Disorder Clinics.**

### 1.5 Security & compliance (table stakes, marketed as a feature)
- **HIPAA** (minimum-necessary access, audited workflows, BAA available), **SOC 2 Type II** (annual
  independent audit, report under NDA), **ISO 27001**, **GDPR** (data-subject rights, EU residency on
  request).
- **Healthcare-grade observability:** every agent action, decision, and handoff captured with full
  context — **monitor, replay, audit**. Live audit trail events: `agent_executed`, `decision_logged`,
  `tool_called`, `memory_updated`, `output_generated`.

### 1.6 What this tells a system architect
The product is a **compound agent platform**, not three apps. The defensibility is: (a) deep EHR/payer
**integration surface**, (b) a **per-tenant memory + learning loop**, (c) **auditable, compliant**
agent execution. We must build the *platform* (identity, memory, tools, audit, integrations) once and
express each vertical as agents + workflows + UI on top.

---

## 2. Product scope & requirements

### 2.1 Build order (deliberate)
1. **Curanote (scribe)** — fastest to value, clearest ROI, lowest regulatory surface (no money moves).
2. **Platform hardening** — memory, learning loop, audit, EHR write-back connectors.
3. **Curadesk (voice)** — telephony + real-time voice agent.
4. **Curabill (RCM)** — claims/X12, payer rules, denial prediction (highest risk, most compliance).

### 2.2 Curanote — functional requirements (MVP → V1)
- **FR-1 Capture:** record in-browser (mic + system audio for telehealth), **dictate**, or **upload
  audio** (mp3/m4a/wav). Explicit **consent gate** before capture; logged.
- **FR-2 Live transcription:** streaming ASR with **speaker diarization** (clinician vs client),
  timestamps, confidence, medical/BH vocabulary boosting. Partial results < ~1s.
- **FR-3 Note generation:** produce a structured note in a chosen template (**SOAP/DAP/BIRP/GIRP/
  SIRP/PIRP/PIE/custom**), aware of **20+ modalities**. Every clinical statement must **trace to a
  transcript span** (anti-hallucination).
- **FR-4 Template system:** clinician/org-level templates as **section schemas + style exemplars**;
  create/edit/clone; set default. This encodes "your format."
- **FR-5 Personalization:** learn tone/terminology from the clinician's edits (few-shot memory);
  measurably match voice after ~1 session.
- **FR-6 Review & sign:** rich note editor with per-section regenerate, inline transcript evidence,
  **risk/safety flags** (SI/HI, mandated-reporting cues) surfaced but never auto-acted. Explicit
  **Sign** action; nothing auto-signs.
- **FR-7 EHR sync ("Super Fill"):** one-click push into the EHR note field/encounter; graceful
  fallback to **formatted copy-to-clipboard** if no API. Idempotent, retried, audited.
- **FR-8 History:** searchable list of sessions/notes with status (`draft → reviewed → signed →
  synced`), client roster (minimal PHI), retention controls.
- **FR-9 Dictation & templates for non-session notes:** treatment plans, intake summaries.

### 2.3 Curadesk — functional requirements (later)
Inbound call answer <2s; caller ID + record lookup; referral qualification script; appointment
booking against calendar/scheduler; real-time **benefits verification**; call transcript + summary +
disposition written back; escalation/handoff to a human.

### 2.4 Curabill — functional requirements (later)
Eligibility/benefits checks; **X12 837** claim generation & submission via clearinghouse; **835 ERA**
ingestion; denial detection + **CARC/RARC** reason mapping; automated follow-up/appeals drafting;
payment posting; per-payer rules engine + denial-pattern learning.

### 2.5 Cross-cutting platform requirements
- **Multi-tenant** (org = clinic); strict row-level isolation by `org_id`.
- **Per-tenant agent memory** (facts, preferences, corrections) + **natural-language policy updates**.
- **Immutable audit log** of every agent/user action touching PHI; replayable execution traces.
- **RBAC:** owner / admin / clinician / front-desk / biller.
- **Observability:** metrics, traces, structured logs; per-agent run inspector.

### 2.6 Non-functional requirements
| Area | Target |
|---|---|
| Live transcript latency | < 1.5 s partials; final transcript within seconds of session end |
| Note generation | draft ready in < 60 s post-session (streamed as it writes) |
| Voice answer (Curadesk) | < 2 s to first response |
| Availability | 99.9% for capture/API; graceful offline capture buffering |
| Security | Encryption in transit (TLS 1.2+) & at rest (AES-256); BAAs with all subprocessors |
| Compliance | HIPAA from day 1; SOC 2 Type II track; audit log immutable |
| Accessibility | WCAG 2.1 AA on product + marketing |
| Data residency | US default; configurable |

---

## 3. System architecture

### 3.1 High-level
```
                         ┌────────────────────────── CLIENTS ──────────────────────────┐
                         │  Marketing site (Next.js)   Product web app (React/Vite)     │
                         │                              Clinician mobile capture (later) │
                         └───────────────┬──────────────────────────┬──────────────────┘
                                         │ HTTPS/REST                │ WSS (audio, live transcript, agent status)
                         ┌───────────────▼──────────────────────────▼──────────────────┐
                         │                 FASTIFY API / REALTIME GATEWAY               │
                         │  auth (WorkOS)  ·  REST  ·  WebSocket hub  ·  rate limit      │
                         └───┬───────────┬───────────────┬───────────────┬──────────────┘
                             │           │               │               │
                   ┌─────────▼──┐  ┌─────▼──────┐  ┌──────▼──────┐  ┌─────▼─────────┐
                   │ Transcribe │  │  LLM/Agent │  │  Durable    │  │  EHR / Payer  │
                   │  service   │  │  gateway   │  │  workflows  │  │  connectors   │
                   │ (ASR)      │  │ (Claude…)  │  │ (Temporal)  │  │ (adapters)    │
                   └─────┬──────┘  └─────┬──────┘  └──────┬──────┘  └─────┬─────────┘
                         │               │                │               │
                         └───────────────┴────────┬───────┴───────────────┘
                                                   │
                    ┌──────────────────────────────▼───────────────────────────────┐
                    │  PostgreSQL (Drizzle)  ·  Object storage (audio, encrypted)   │
                    │  Redis (queues/cache)  ·  Vector store (memory/RAG)  ·  Audit  │
                    └──────────────────────────────────────────────────────────────┘
```

### 3.2 Nx monorepo layout
```
cura/
├── apps/
│   ├── marketing/          # Next.js — public site (the "better than theirs" landing)
│   ├── web/                # React + Vite — the clinician product (record, editor, dashboard)
│   ├── api/                # Fastify — REST + WS gateway, auth, orchestration entrypoints
│   ├── realtime/           # WS audio ingest + ASR fan-out + live-transcript broadcast
│   ├── worker/             # Durable jobs: note gen, EHR sync, RCM steps, retries
│   └── voice/              # (later) Curadesk telephony bridge (Twilio/LiveKit) + voice agent
├── libs/
│   ├── db/                 # Drizzle schema, migrations, typed repositories
│   ├── auth/               # WorkOS wrapper: sessions, orgs, SSO, SCIM, RBAC guards
│   ├── llm/                # Model gateway: routing, prompt registry, structured output, guards
│   ├── agents/             # Agent runtime: tools, memory, planner, run tracing
│   ├── transcription/      # ASR client(s), diarization, vocab boosting
│   ├── notes/              # Template engine (SOAP/DAP/…), formatters, note schema, redaction
│   ├── ehr/                # EhrConnector interface + per-vendor adapters
│   ├── rcm/                # (later) X12 837/835, payer rules, denial mapping
│   ├── audit/              # Append-only audit log + replay + observability hooks
│   ├── ui/                 # Design system: tokens, primitives, product + marketing components
│   └── shared/             # Zod schemas, types, config, error taxonomy, feature flags
├── infra/                  # IaC (Terraform), migrations runner, deploy, seed
├── nx.json  ·  package.json  ·  tsconfig.base.json
```

### 3.3 The Curanote critical path (real-time)
```
[Browser mic/system audio]
        │  1. consent captured & logged
        ▼
[WSS → realtime gateway]  ──frames──►  [Streaming ASR]  ──►  diarization + vocab boost
        │                                     │
        │◄──── partial transcript (WS) ───────┘
        ▼
[Live transcript UI]  (clinician sees words appear)
        │  session ends
        ▼
[worker: note-generation workflow]
        │  a. high-accuracy batch re-transcribe full audio
        │  b. LLM gateway: (template schema + transcript) → structured note JSON
        │  c. evidence-linking + risk-flag pass
        ▼
[Note editor UI]  ── streamed draft ──►  clinician edits per section
        │  explicit Sign
        ▼
[worker: EHR write-back adapter]  ──►  EHR   (idempotent, retried; fallback = formatted copy)
        │
        ▼
[audit_events]  +  edit-diff feeds personalization memory
```
**Key decisions:** streaming ASR for *perceived* latency, batch re-pass for *accuracy*; note is
generated as **structured JSON matching the template schema** (deterministic render + validation +
diffable), streamed to the editor; **never auto-sign**; edits are the training signal.

### 3.4 Agent runtime (`libs/agents`)
- **Tools** = typed functions the agent may call (e.g. `ehr.createNote`, `calendar.book`,
  `payer.checkEligibility`, `memory.write`). Each tool logs to audit.
- **Memory** = per-tenant store: durable facts + preferences + corrections (Postgres + vector index).
  Natural-language policy updates write structured memory entries applied to future runs.
- **Planner** = LLM tool-calling loop with guardrails, step limits, and human-in-the-loop gates on
  side-effectful tools.
- **Run tracing** = every step (input, decision, tool call, output) persisted → powers the audit
  trail + replay UI. This *is* the "healthcare-grade observability" feature.

---

## 4. Data model (PostgreSQL + Drizzle)

Multi-tenant, `org_id` on every row, soft-delete, `created_at/updated_at`, audit on writes.
Encrypt PII/PHI columns (app-level envelope encryption + KMS).

**Identity & tenancy**
- `organizations` (WorkOS org id, plan, data-residency, retention policy)
- `users` (WorkOS user id, role, org_id)
- `memberships` (user↔org, role, permissions)

**Clinical (Curanote)**
- `clients` — patient; minimal encrypted PII (name, DOB, MRN)
- `note_templates` — `{ sections: [...schema], style_examples, format, modality_hints, is_default }`
- `sessions` — clinician_id, client_id, modality, start/end, consent_flag, source(`live|dictation|upload`), status
- `recordings` — encrypted object ref, duration, checksum, retention_expires_at
- `transcripts` — session_id; `segments: [{ speaker, start, end, text, confidence }]`
- `notes` — session_id, template_id, `content_json`, `content_rendered`, status(`draft|reviewed|signed|synced`), model+prompt_version, risk_flags
- `note_edits` — diffs (append-only) → personalization signal

**Platform**
- `agent_runs` — vertical, trigger, status, tokens, cost, duration
- `agent_steps` — run_id, seq, type(`decision|tool_call|memory|output`), payload, latency
- `agent_memory` — org_id, scope, key, value_json, source(`learned|policy|correction`), vector_id
- `integrations` — org_id, kind(`ehr|phone|calendar|payer|files`), vendor, encrypted_credentials, status
- `ehr_sync_jobs` — note_id, vendor, attempt, status, vendor_response
- `audit_events` — actor, action, resource, phi_touched, context_json, ts (append-only, tamper-evident hash chain)

**RCM (later)**
- `claims` (837 payload, status), `remittances` (835), `denials` (CARC/RARC, resolution),
  `eligibility_checks`, `payers`, `payer_rules`.

**Front desk (later)**
- `calls` (recording, transcript, disposition), `referrals`, `appointments`.

---

## 5. Tech stack decisions (and why)

| Layer | Choice | Why |
|---|---|---|
| Monorepo | **Nx** | Matches Cura; shared libs across verticals; task graph + caching |
| Language | **TypeScript** everywhere | One language, shared types front↔back |
| API | **Fastify** | Fast, schema-first (JSON Schema/Zod), first-class WS |
| Realtime | **WebSockets** (ws/uWebSockets) | Audio in, transcript + agent status out |
| DB | **PostgreSQL** + **Drizzle** | Typed SQL, migrations-as-code, RLS-friendly |
| Cache/Queue | **Redis** + **BullMQ** | Job queue, rate limits, pub/sub for WS fan-out |
| Durable workflows | **Temporal** (or BullMQ flows to start) | RCM/EHR sync need retries, timeouts, replay |
| Auth | **WorkOS** | SSO, **SCIM** directory sync, org mgmt — enterprise clinics expect it |
| Product frontend | **React + Vite + TanStack Query + Zustand** | Fast, real-time-friendly SPA |
| Marketing frontend | **Next.js (App Router) on Vercel** | SEO, ISR, edge, great DX for a cinematic site |
| Styling | **Tailwind + CSS variables (design tokens)** + Radix/shadcn primitives | Token-driven, accessible |
| Motion | **Framer Motion** + **Lenis** (smooth scroll) + GSAP ScrollTrigger for the flow-line | Buttery scroll storytelling |
| ASR | **Deepgram** or **AssemblyAI** (streaming + diarization + medical) | Real-time + accuracy; BAA available |
| LLM | **Claude** (latest Opus/Sonnet) via a model-agnostic gateway | Best fidelity for clinical note drafting; note faithfulness matters most |
| Voice (later) | **LiveKit / Twilio + realtime voice** | <2s answer for Curadesk |
| Vector/memory | **pgvector** (start) | Keep memory in Postgres; simple, compliant |
| Object storage | **S3 (SSE-KMS)** or Vercel Blob (private) | Encrypted audio at rest |
| Observability | **OpenTelemetry + Grafana/Datadog**, Sentry | Traces/metrics/errors |
| IaC / deploy | **Terraform**; product on AWS (HIPAA/BAA), marketing on Vercel | Compliance boundary around PHI |

> **PHI boundary:** all PHI (audio, transcripts, notes) stays inside the HIPAA-eligible AWS account
> with signed BAAs (AWS, Deepgram/AssemblyAI, Anthropic via BAA-covered access). The Vercel-hosted
> marketing site holds **no PHI**.

---

## 6. API surface (representative)

REST (Fastify, Zod-validated, WorkOS-guarded):
- `POST /sessions` · `PATCH /sessions/:id` · `GET /sessions`
- `POST /sessions/:id/consent`
- `POST /sessions/:id/uploads` (audio) → presigned URL
- `POST /notes/:id/generate` · `POST /notes/:id/sections/:key/regenerate`
- `PATCH /notes/:id` (edits) · `POST /notes/:id/sign` · `POST /notes/:id/sync`
- `GET/POST/PATCH /templates`
- `GET/POST /integrations` (EHR/phone/calendar connect via OAuth)
- `GET /agent-runs/:id` (+ steps) — run inspector / audit replay
- `POST /agents/:vertical/policy` (natural-language policy update)

WebSocket channels:
- `audio:ingest` (client → server: PCM/Opus frames)
- `transcript:live` (server → client: partial/final segments)
- `note:stream` (server → client: streamed note JSON as it generates)
- `agent:status` (server → client: run/step updates, for the live audit UI)

---

## 7. AI / LLM layer (`libs/llm` + `libs/agents`)

- **Model gateway:** route per task, with fallback + cost/latency tracking; pin model + prompt
  version on every generation for reproducibility/audit.
- **Structured note generation:** force JSON output matching the template's section schema; validate
  with Zod; reject/repair on mismatch. Prompt includes template schema, style exemplars, transcript,
  modality hints.
- **Anti-hallucination:** post-gen pass asserts each clinical claim maps to a transcript span; unmapped
  claims are flagged, not silently kept.
- **Safety/risk flags:** detect SI/HI, abuse, mandated-reporting cues → surface to clinician (never
  auto-act).
- **Personalization:** clinician edit diffs → few-shot exemplars in memory → voice match over time.
- **Agentic verticals:** Curadesk/Curabill run the tool-calling agent loop with human-in-the-loop
  gates on irreversible tools (send claim, book, message).
- **Guardrails everywhere:** PHI-minimizing prompts, output validation, step/time limits, full tracing.

---

## 8. Security & compliance requirements (day 1)

- **HIPAA:** BAAs with every subprocessor; minimum-necessary access; PHI access logging; configurable
  retention + hard delete; encryption in transit (TLS 1.2+) and at rest (AES-256, KMS).
- **SOC 2 Type II track:** change management, access reviews, immutable audit log, vendor management,
  incident response — designed in from the start even before certification.
- **ISO 27001 / GDPR / PHIPA / PIPEDA** posture: data-subject rights, lawful processing, EU residency
  option, Canadian compliance for cross-border therapists.
- **RBAC** enforced at API + row level; least-privilege service roles; secrets in a vault (not `.env`
  in prod).
- **Audit log:** append-only, hash-chained (tamper-evident), replayable — powers the observability UI.
- **Consent:** explicit, logged capture consent before any audio.

---

## 9. Delivery roadmap

| Phase | Weeks | Deliverable |
|---|---|---|
| **0 — Foundation** | 1–2 | Nx monorepo, Fastify API, Drizzle/Postgres, WorkOS auth, CI/CD, audit log, encrypted blob storage, design tokens + UI lib skeleton, subprocessor BAAs |
| **1 — Curanote MVP** | 3–6 | Record → streaming transcript → SOAP draft → editable note → copy-to-clipboard. Design partners (3–5 therapists). No EHR write yet |
| **2 — Templates + fidelity** | 7–10 | All note formats + custom templates, modality awareness, per-clinician style learning, batch re-pass, risk flags, dictation + upload |
| **3 — EHR write-back** | 11–16 | One deep EHR adapter ("Super Fill"), idempotent sync jobs, graceful fallback; run inspector / audit replay UI |
| **4 — Platform + Curadesk** | 17–24 | Agent runtime GA, per-tenant memory, NL policy updates; Curadesk voice MVP (Twilio/LiveKit, <2s answer) |
| **5 — Curabill (RCM)** | 25–36 | Eligibility, 837/835, denial detection + follow-up, payer rules + learning; 2–3 more EHR adapters |

---

## 10. Design system — study of Cura, then *our better version*

### 10.1 What Cura does (observed)
- **Mood:** dark, cinematic, "calm-tech." Alternates a warm **near-black** with a **cream/off-white**
  section for contrast and rhythm.
- **Imagery:** AI-generated **nature** (zen rock garden, water, sliced citrus in motion) in
  **bronze/amber + sage** tones — evokes calm + healthcare warmth, not sterile SaaS blue.
- **Type:** oversized, **light-weight humanist grotesque** headlines (single big statements:
  *"Notes that write themselves."*); uppercase, letter-spaced **eyebrows** (`THE PLATFORM`,
  `FRONT-DESK OPERATIONS`); a distinctive `CURA` wordmark with a **theta-styled "O".**
- **Layout:** centered ~1240px container, generous vertical rhythm, **pill-shaped floating nav** with
  blur backdrop.
- **Signature components:** glassmorphic **device/mockup cards** (rounded-3xl) with **floating status
  chips** (`INCOMING CALL`, `Listening`, `PROCESSING/WAITING/STANDBY`, `WORKFLOW · %`); an animated
  **SVG sine-wave "flow line"** with a traveling glow dot connecting the 3 products; **marquees** for
  modalities + EHR logos; a **live audit-trail ticker** (timestamped events).
- **Motion:** scroll-triggered **blur-in text reveals**, parallax on mockups, the animated flow line.
- **Accents:** soft **mint-green glow** (status dots, line gradient) + a small **lime spark/asterisk**
  (chat widget) bottom-right.

### 10.2 Our design North Star — "better than theirs"
Keep the calm, premium, cinematic soul — but beat it on **craft, coherence, and usability**:

1. **Token-driven design system**, not ad-hoc CSS. Every color/space/radius/shadow/motion value is a
   token in `libs/ui` → identical language across marketing *and* product (Cura's polish is mostly on
   the marketing site; we make the **product** look just as good).
2. **Sharper typography.** A crisp display face for hero lines + a highly legible text face, on a true
   modular type scale. Tighter optical kerning, better line-height rhythm, real hanging punctuation.
3. **Real product UI, not just a landing page.** The record screen, live-transcript view, and note
   editor should feel like a flagship app — this is where we visibly out-build them.
4. **Motion with intent + restraint.** Smooth scroll (Lenis), one signature scroll-story (our flow
   line reimagined as a live "session → note → EHR" pipeline), `prefers-reduced-motion` honored.
5. **Depth done right.** Layered glassmorphism with correct backdrop blur, soft grain overlay, subtle
   noise, and physically-plausible shadows — not flat drop-shadows.
6. **Accessibility as polish:** AA contrast even on imagery (scrims), full keyboard nav, focus rings
   that look designed.

### 10.3 Proposed design tokens
```
Color — dark surfaces
  --bg-900:  #0C0D0B   (warm near-black, page)
  --bg-800:  #121311
  --bg-700:  #1A1C19   (cards)
  --line:    #2A2C28   (hairline borders)
Color — light section
  --cream-100: #F4F2EC
  --cream-200: #EAE7DE
  --ink-900:   #14150F  (text on cream)
Brand / accent
  --sage-500:  #8FB89B   (calm green)
  --mint-400:  #A7E8C4   (glow / live status)   ← primary interactive accent
  --amber-400: #E7B27A   (warm imagery tie-in)
  --lime-400:  #C7F04A   (spark / focus highlight, used sparingly)
  --danger:    #E5776B   (risk flags)
Text
  --text-hi:  rgba(255,255,255,.94)
  --text-mid: rgba(255,255,255,.66)
  --text-lo:  rgba(255,255,255,.42)
Radius:  sm 8 · md 14 · lg 22 · xl 32 · pill 999
Shadow:  card 0 20px 60px -20px rgba(0,0,0,.55);  glow 0 0 40px rgba(167,232,196,.25)
Space scale: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128
Motion:  ease-out-expo cubic-bezier(.16,1,.3,1); durations 200/400/700ms
```

### 10.4 Typography
- **Display / headlines:** a light humanist grotesque — e.g. **PP Neue Montreal**, **Aeonik**, or
  free **Geist** / **Instrument Sans**. Weights 300–500, large sizes, tight leading.
- **Body / UI:** **Inter** or **Geist** (400/500) for ruthless legibility at small sizes.
- **Mono (audit/logs/code chips):** **Geist Mono** / **JetBrains Mono**.
- **Type scale (rem):** 0.75 · 0.875 · 1 · 1.125 · 1.375 · 1.75 · 2.25 · 3 · 4 · 5.5 · 7.

### 10.5 Signature components to build in `libs/ui`
- `FloatingNav` — pill, blur backdrop, scroll-aware (shrinks/darkens on scroll).
- `Eyebrow` — uppercase, letter-spaced, tick/dot prefix.
- `HeroStatement` — oversized headline with scroll **blur-in reveal** (respects reduced-motion).
- `DeviceCard` / `GlassPanel` — glassmorphic mockup shell + floating `StatusChip`s.
- `FlowLine` — animated SVG sine wave + traveling glow dot (GSAP ScrollTrigger); reimagined in-product
  as the **live session→note→EHR pipeline** visual.
- `Marquee` — infinite logo/modality row (pausable, reduced-motion safe).
- `AuditTicker` — timestamped live event stream (real data in-product, canned on marketing).
- `StatCluster` — "6,000+ clinics / 30+ states" style metric row.
- Product: `RecordBar`, `LiveTranscript`, `NoteEditor` (section blocks + per-section regenerate +
  evidence popover), `RiskFlag`, `TemplatePicker`, `SyncButton` ("Super Fill"), `RunInspector`.

### 10.6 Marketing site page map (Next.js `apps/marketing`)
Home (hero → platform/flow-line → 3 product sections → domain-native marquee → integrations →
the Cura-loop 4 cards → security → CTA → footer), plus `/curanote`, `/curadesk`, `/curabill`,
`/security`, `/integrations`, `/careers`, `/journal` (blog for SEO, mirroring curanote.ai's content
engine), `/book-a-demo` (Cal.com/Calendly embed). SEO + ISR + OG images.

### 10.7 Product app map (React `apps/web`)
`/` dashboard (today's sessions, quick record) · `/record` (consent → live capture → transcript) ·
`/notes/:id` (editor + evidence + sign + sync) · `/sessions` (history) · `/templates` ·
`/integrations` · `/agents/:vertical` (memory + NL policy + run inspector) · `/settings` (org, RBAC,
security, retention).

---

## 11. How this maps to the Product-Engineer role (owning a vertical)
The architecture is intentionally **vertical-ownable**: shared platform libs (`auth`, `db`, `ui`,
`agents`, `audit`, `ehr`, `llm`) + one owned app/agent per vertical. A product engineer can own
**Curanote** end-to-end — talk to therapists, define the note-quality bar, build the React editor +
Fastify/WS pipeline + Drizzle schema + Claude note-gen, ship EHR write-back, and keep the learning
loop turning — exactly the "zero-to-one, talk-to-customers-in-the-AM, ship-in-the-PM" mandate.

---

## 12. Top risks & mitigations
| Risk | Mitigation |
|---|---|
| PHI breach / compliance miss | Encryption, BAAs, least-privilege, hash-chained audit log, SOC 2 track from day 1 |
| LLM hallucination in a legal record | Mandatory human review + explicit sign; every claim traces to transcript; never auto-sign |
| Messy EHR integrations / no public API | `EhrConnector` interface + graceful fallbacks; go deep on ONE vendor first |
| Real-time latency (transcript/voice) | Streaming ASR, near-user WS, latency as a first-class SLO |
| Clinician trust & adoption | Match exact note format; keep clinician in control; show time-saved metrics |
| Design polish debt | Token system shared by marketing + product from day 1; motion budget + reduced-motion |

---

## 13. Immediate next steps
1. Scaffold the **Nx monorepo** (`apps/api`, `apps/web`, `apps/marketing`, `libs/db`, `libs/ui`).
2. Stand up **Fastify + WS + Drizzle/Postgres + WorkOS** and the **design-token system** in `libs/ui`.
3. Build the **Curanote capture→transcript→note→editor** vertical slice against **Deepgram + Claude**.
4. Ship the **cinematic marketing home** (hero + flow-line + 3 product sections) in `apps/marketing`.
5. Recruit **3–5 therapist design partners** and start the feedback loop.

*Sources: [heycura.com](https://heycura.com/) (live site — visual + copy study) and
[curanote.ai](https://www.curanote.ai/) (scribe feature set), plus the Curanote "Product Engineer"
job description.*
