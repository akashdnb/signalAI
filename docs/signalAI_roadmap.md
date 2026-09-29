# Non-Goals (positioning commitments, not omissions)

These are the market gaps signalAI exists to exploit. Each will come under pressure at some point — margin pressure, a feature-parity request, a shortcut under deadline. They are written down so that reversing one is a deliberate repositioning decision, not a drift.

- **Never bill per stored contact.** No Monthly-Active-Contact pricing. ManyChat/Chatfuel bill per contact in the database, so a creator whose Reel goes viral sees their bill jump from $29 to $200+ for leads who never buy. signalAI bills on three separate meters: a flat plan fee, AI token consumption, and Meta's per-message fees passed through at cost ([[#Phase 2B — Billing & Monetisation|Phase 2B]]). Every one of them tracks value delivered; none tracks audience size. A contact sitting in the database costs the tenant nothing, forever. See [[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]] Billing and [[#Phase 2B — Billing & Monetisation|Phase 2B]].
- **No drag-and-drop flowchart builder.** The competing model forces creators to draw subway-map flows that break the moment a customer asks an off-path question. signalAI's equivalent is the Milestone Engine ([[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]]): an ordered list of goals in plain language, with the AI free-form on language but constrained on direction — grounded against a tenant knowledge base once [[#Phase 2C — Conversational AI Engine (RAG)|Phase 2C]] adds one.
- **No unofficial / session-based (web-scraping) WhatsApp automation**, at any phase, as any tier, however it is pitched as a lower-barrier MVP shortcut. It violates WhatsApp's terms and carries real ban and legal risk — for the client's number, not just ours.
- **No self-hosted GPU inference.** Dedicated GPU infra costs hundreds per month at zero customers, which defeats the low-investment premise. Inference is always a metered API call to a hosted provider.

---

# Phase 0 — Long-Lead-Time Prerequisites

> Everything here is calendar-bound or money-bound rather than effort-bound, and Phase 1 cannot ship to a paying customer without it. Start all of it on day one, in parallel with Phase 1 engineering — none of it blocks writing code, and all of it blocks launch.

- **Legal entity registration** — Meta Business Verification requires business documents (registration certificate, address proof, in some flows a bank statement or utility bill). An unregistered solopreneur cannot complete it, which makes this a hard blocker on serving any customer, not a formality. It also has the longest lead time and the only meaningful up-front cost in the plan.
- **Domain purchase** (~$10–12/yr) — needed for the app's public URLs and typically required for Business Verification.
- **Privacy Policy, Terms of Service, and a live Data Deletion callback URL** — all three are submission requirements for Meta App Review. The deletion endpoint must actually work at review time, which is why the deletion machinery is a [[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]] foundation rather than a Phase 9 compliance item.
- **Meta app created in Development Mode** — do this before writing the first webhook handler, so all of Phase 1 is built and piloted against a real app rather than mocks.
- **Instagram auth path** — decided (Instagram API with Instagram Login, see Tech Stack); the Phase 0 action is requesting `instagram_business_manage_messages` in the app config and writing the permission justification for review.
- **Recruit 2–3 pilot creators as app testers** — users with a role on the app can be messaged in Development Mode without Advanced Access. This is what makes it possible to run real campaigns on real Reels *before* App Review, instead of discovering product problems after a months-long approval.
- **App Review submission artifacts** — screencast of the full user flow, use-case justification per permission, test credentials. First submissions commonly get rejected; budget for at least two rounds.

> **Gate to launch (not to Phase 1):** App Review approved for `instagram_business_manage_messages` + Business Verification complete. Phase 1 engineering proceeds in parallel and is validated on pilot testers regardless of review status.

---

# Tech Stack (decided — low-investment start)

### Backend & Frontend
- Backend: Node.js + TypeScript
- Frontend: React (SPA), static-hosted
- Containerization: Docker
- Hosting: Render — **pay the $7/mo Starter tier for the webhook-receiving service from the moment the app enters App Review**, not once real traffic starts. Free instances spin down after 15 min and take ~1 min to wake; sustained webhook delivery failures don't just read as a dropped message, they can get Meta to disable the webhook subscription outright. $7/mo is cheap insurance against re-subscribing and re-reviewing.

### Database & Storage
- Database: PostgreSQL, hosted on **Neon** (not Render's free Postgres, which expires 30 days after creation + a 14-day grace period, then deletes — not viable past initial testing). Neon's free tier doesn't expire and includes `pgvector` out of the box. Note its compute suspends when idle, so a webhook arriving cold pays a wake-up penalty — acceptable for pilot, revisit if it shows up in reply latency.
- Vector store: `pgvector` inside the same Postgres — no separate vector DB needed for RAG
- Object storage (Knowledge Base uploads, [[#Phase 2C — Conversational AI Engine (RAG)|Phase 2C]]/[[#Phase 5 — AI Sales Agent|Phase 5]]): Cloudflare R2 — 10GB free, no egress fees, S3-compatible
- Background queue: `pg-boss` (Postgres-backed) instead of Redis+BullMQ — runs on the same Neon database, no separate paid Redis service. **Requires pg-boss 12.x**, whose `key_strict_fifo` queue policy gives exactly the per-lead ordering described in Platform Foundations: FIFO per `singletonKey`, with blocking scoped to the individual key so other keys stay fetchable. Set `singletonKey = lead_id`. Two documented consequences to design around, both in Platform Foundations below.

### Instagram auth path — decided: Instagram API with Instagram Login
Two paths exist and they are not interchangeable. **Instagram API with Instagram Login** is the choice: Meta's docs state plainly that "this API setup does not require a Facebook Page to be linked to the Instagram professional account," which removes the single largest onboarding drop-off for creators — most have a professional account but no linked Page, and asking them to create one mid-signup loses them. Messaging scope is `instagram_business_manage_messages`. The alternative, **Facebook Login for Business**, requires the Page link and is only worth revisiting if a later phase needs Facebook-side data (see [[#Phase 7 — Omnichannel Expansion|Phase 7]] Facebook), at which point it is an additive second connection flow rather than a replacement.

### LLM Integration — swappable by design
- Swap mechanism: a config-driven `provider` field + a slim internal provider interface — same pattern already proven in the `linkedin-job-search` project (`config.yaml`'s `llm.provider` + a per-provider factory), ported to TypeScript. Switching providers later is a config change, not a rewrite.
- **Primary provider: pick a hosted provider with published rate limits and a production track record** — Groq, Together AI, DeepSeek, or Gemini Flash. Ollama Cloud was the earlier default but is a comparatively new hosted offering; for a public comment reply, latency and uptime are user-visible under the client's brand. Selection criterion that matters most here is **structured-output / tool-calling reliability**, since the Milestone Engine depends on the model returning parseable state transitions, not just prose.
- Local Ollama (not cloud) for development only — free, no latency/availability stakes there.

### Notifications & Ops
- Telegram Alerts (Telegram Bot API — free) instead of Slack
- Email Alerts: Resend (3,000/month free)
- Error tracking: Sentry (5k errors/month free)
- Billing: Stripe (subscriptions + metered usage)

---

# Phase 1 — MVP: Instagram Comment Automation

> **Scope discipline:** everything below is either a foundation that is expensive to retrofit, or the minimum needed to run a real campaign for a real creator and charge them for it. Items explicitly deferred out of Phase 1 are listed at the end of this phase — they are cut for sequencing, not rejected.

### Platform Foundations (decide now, not in later phases)
- Tenant-scoped data model — every customer-data table carries `tenant_id` from the first migration, enforced in a single data-access layer (or DB row-level security), even though Phase 1 has one tenant per account. Retrofitting this after Phase 4/5 exist means auditing every query for cross-customer leaks. See [[#Phase 6 — Agency Platform|Phase 6]] Multi-Tenant System.
- Messaging-window state machine — `last_inbound_at` / `window_open_until` per lead, validated before every outbound send, so the 24-hour DM window is enforced in code, not just policy.
- Per-account rate limiting & send queue — scoped per connected Instagram professional account so one client can't starve another. Meta's documented per-account ceilings (confirmed Sep 2026): **100 calls/sec** for messages containing text, links, reactions or stickers; **10/sec** for audio or video; **750/hour** for private replies to comments on posts and Reels; **100/sec** for private replies to Live comments. The 750/hour private-reply ceiling is the binding one for signalAI's comment-triggered flow and is the number the send queue must be sized against — note it is an *hourly* budget, so a viral Reel exhausts it in minutes and the queue must drain over hours rather than drop. Ignore the "200 DMs/hour" figure circulated by automation vendors; it is a vendor pacing convention, not a Meta limit.
- Data deletion webhook / consent capture — required for Meta App Review approval; the endpoint must be live before submission ([[#Phase 0 — Long-Lead-Time Prerequisites|Phase 0]]). Do not defer to Phase 9 Compliance — Phase 9 extends this, it does not introduce it.
- Durable event pipeline — webhook handlers only persist the raw event (keyed by Meta's event ID for idempotency) and ack quickly; a separate worker processes it with retry/backoff, so a downstream failure (e.g. a rate limit) doesn't lose the event. Add periodic reconciliation/backfill polling to catch events a dropped webhook would otherwise silently miss. This event log is the source of truth that Lead Timeline, Attribution, Analytics, and Billing all read from — decide this now, since every later phase reads from it.
- Per-lead event ordering — order only needs to hold per lead/conversation, not globally. **Implementation: pg-boss `key_strict_fifo` with `singletonKey = lead_id`** — one lead's events apply in order while different leads process in parallel, with no extra infrastructure. Track a `last_applied_sequence`/timestamp per lead and skip state-mutating side effects for an event older than the frontier (handles retries resurrecting a stale event) — but still log it for the audit trail. Two consequences of this policy that must be designed for, not discovered:
  - **A failed job blocks its own key.** Jobs are held back while a same-key job is active, *in retry, or failed* — so one permanently-failed event stalls that lead's conversation indefinitely. Needs a dead-letter path plus an operator action (and an alert) to clear a wedged `lead_id`, or a lead silently goes dark mid-conversation.
  - **The policy is efficient when keys accumulate backlogs, less so with many unique keys holding one job each** — which is signalAI's exact shape, since most leads produce one or two events. Measure fetch throughput under a simulated viral spike (tens of thousands of distinct `lead_id`s, one event apiece) before assuming it holds; the fallback is a per-lead Postgres advisory lock on a standard queue.
  Display/attribution ordering (Lead Timeline, first/last-touch) just sorts by Meta's own event timestamp at read time and needs none of this.
- PII / event-fact separation — the event log stores structural facts only (timestamps, event type, `lead_id`, counts, sequence numbers); comment/DM text, username, and phone number live in a separate table keyed by `lead_id`. This is what makes the Data Deletion Callback above real: deletion soft-deletes the row (keeps `lead_id`/timestamps/foreign keys intact so Attribution/Analytics/Billing stay consistent) but hard-scrubs the PII content fields (overwritten, not just flagged). Also purge the corresponding vector-store embedding by `lead_id` once [[#Phase 2C — Conversational AI Engine (RAG)|Phase 2C]]'s RAG engine exists, and invalidate any cached AI context derived from the scrubbed content — a flag alone leaves recoverable PII in the row, backups, and embeddings, which doesn't satisfy erasure.
- **Cross-channel identity spine** — `lead_id` is minted at first Instagram contact and is the only identity the conversation engine ever keys on; channel-specific handles (`instagram_user_id`, later `whatsapp_phone`) hang off it as attributes. Build this in Phase 1 even though Phase 1 has one channel, because it is the thing [[#Phase 3 — WhatsApp Automation|Phase 3]]'s context carryover resolves against. See Identity Resolution in Phase 3 for how a second channel actually attaches to an existing `lead_id`.
- **Customer/Lead split** (added from CRM/Revenue Intelligence architecture review, 2026-09-21 — see `docs/architecture_and_ui_roadmap.md`) — a minimal `customers` table (`id`, `created_at`) plus a `customer_id` column on `leads`, minted 1:1 with each lead for now. No behavior change in Phase 1 (one lead is still one customer in practice). The reason to add it here rather than in Phase 2A: today `lead_id` *is* the identity the whole system keys on, and by Phase 2A that'll be true of tags, notes, ownership and pipeline stage too. Once a real person can plausibly generate a second lead (a repeat Reel engager, a second campaign touch), reconciling that means the same lead-as-identity retrofit-auditing problem this section exists to avoid — so mint the seam now, while it's a single additive migration, and let Phase 3's identity resolution attach a second `lead_id` to an existing `customer_id` when the time comes. **Shipped 2026-09-21** — migration `1758240000028`, `db/leads.ts`; see `claude_fixes/2026-09-21-customer-lead-split.md`.

### Security Foundations
- **Webhook signature verification** — validate `X-Hub-Signature-256` on every inbound payload and implement the `hub.verify_token` subscription handshake. The endpoint is public; without this, anyone can forge events into the source-of-truth event log.
- **Encryption at rest for Meta access tokens** — a multi-tenant table of long-lived tokens is the highest-value target in the system. Envelope-encrypt the token column with a key held outside the database, rather than relying on the database being private.
- **Untrusted-input isolation for AI replies** — public comment text is attacker-controlled input flowing into a prompt whose output is posted publicly under the client's brand. Treat comment/DM text as data, never as instructions: structural separation in the prompt, plus the output validation in Global Guardrails + Output Validation below. Prompt injection here is a brand-safety incident for the client, which directly undercuts the "brand-safe autonomous agent" positioning.
- **Hard per-account AI spend ceiling** — a daily cap on AI calls/tokens per connected account, enforced before the provider call, failing *closed* to the Rule-Based fallback reply rather than dropping the reply. Phase 1 ships AI replies on a flat plan, so a pilot Reel drawing 20k comments is otherwise an uncapped bill charged to us. This is a foundation, not a billing feature — the tiered quota system in [[#Phase 2B — Billing & Monetisation|Phase 2B]] builds on this ceiling rather than introducing it.

### Account & Authentication
- Instagram Business Login (Instagram API with Instagram Login — no Facebook Page connection step, see Tech Stack)
- Access Token Management
- Token Refresh Handling
- Account Health Monitoring — pulled back into Phase 1 from the original deferral: [[#Phase 3 — WhatsApp Automation|Phase 3]]'s Quality-Rating Health Monitoring extends this, so it has to already exist by the time Phase 3 starts, not be deferred past it

### Automation Engine
- Keyword-based Comment Triggers
- Multiple Keywords per Campaign
- Case-insensitive Contains-Match — one matching mode, not a configurable set. Exact-vs-contains as separate selectable modes is a preference surface no pilot has asked for; add it when one does.
- Duplicate Event Protection
- Comment Event Processing

> **DM Conversation Continuation, shipped 2026-09-28.** Matching here was originally entirely stateless per-message — a real live conversation surfaced that a customer replying in their own words mid-conversation, without repeating an exact configured keyword, got silently dropped (no reply, no trace). Fixed via `leads.active_dm_campaign_id` (set on every real keyword match for a DM event, read as a fallback for a later message in the same still-open 24h messaging window that doesn't independently match anything) — surfaced in the timeline via a `(ongoing conversation)` sentinel keyword so it reads as distinct from a genuine silent non-match. Comments are deliberately excluded — a public comment thread isn't a private ongoing conversation the same way. Full detail in `claude_fixes/2026-09-28-dm-continuation-and-timeline-replies.md`.

### Milestone Engine — the core differentiator
> This is the thing competitors don't have, and it is what makes an AI reply a *sales* reply rather than a chatbot reply. Legacy platforms make creators draw flowcharts that break on any off-path question; pure LLM bots wander off-topic. The Milestone Engine is the hybrid: the creator writes an ordered list of goals, and the AI is free-form on language but constrained on direction.

> **Multi-Field Capture + Field-Definitions Registry, shipped 2026-09-29.** A milestone could only ever capture one field per conversational turn, forcing "collect email" and "collect mobile number" into two separate back-and-forth turns a real lead would often answer together if just asked together. `capture_field` is now `capture_fields` (an array) — a milestone advances once every requested field is known, whether given in one message or across turns, and a partial answer is persisted immediately rather than re-asked for. Also added a per-tenant Field-Definitions registry (email/phone/country/number/date/text) so a captured field gets real format validation by its registered type instead of the old email/phone-name-substring heuristic — closing a real gap where an unregistered field like `user_country` accepted almost any string. Full detail in `claude_fixes/2026-09-29-milestone-multi-field-capture-and-field-definitions.md`.

- Milestone Definition — per campaign, an ordered list of goals in plain language (e.g. `1. capture email → 2. send pricing → 3. book call`). No flowchart, no branching canvas. This is the creator's entire configuration surface.
- Active Milestone State — the conversation state is a single `active_milestone_id` per lead plus the facts captured so far; the database tracks position, not a graph traversal.
- Milestone Advancement Check — after each exchange, a structured-output call decides whether the current milestone's exit condition is satisfied, and extracts the captured fields (email, budget, location — a milestone may request more than one at once) as typed data rather than free text. This is why provider choice in Tech Stack weights structured-output reliability.
- Steering Constraint — every generation is conditioned on the active milestone, so an off-topic question gets answered *and* redirected, rather than derailing the conversation or hitting a dead end.
- Milestone Analytics — drop-off per milestone, which is the metric that tells a creator where their funnel actually leaks. Feeds [[#Phase 4 — Revenue Attribution & Analytics|Phase 4]] Funnel Analytics.
- Captured Facts → Lead Record — extracted fields land on the lead, which is the seed of the Conversational CRM in [[#Phase 2A — Lead Capture & CRM|Phase 2A]]: the pipeline moves on semantic analysis of the conversation, not on manual tagging.

### Reply Engine (per campaign)
- AI-Generated Reply — a direct LLM call (via the swappable provider in Tech Stack) driven by the Milestone Engine above, without a per-tenant Knowledge Base yet (that's [[#Phase 2C — Conversational AI Engine (RAG)|Phase 2C]]'s RAG upgrade to this same mode). Requires the Global Guardrails + Output Validation layer below even at this simple stage — an AI reply with no safety net is a public-comment risk from day one, not just once RAG exists.
- Rule-Based Reply (Code-Generated) — pattern matching across a set of pre-written replies plus a default reply; deterministic, zero token cost. Ships in Phase 1 because it is *also* the fail-closed path for the AI spend ceiling and for provider outages, so it is required infrastructure rather than a second product mode.
- Global Guardrails + Output Validation — pulled forward from [[#Phase 2C — Conversational AI Engine (RAG)|Phase 2C]]'s Conversational AI Engine design, since any AI-Generated Reply needs this the moment it exists. Phase 2C extends this same layer rather than building it twice.
- Comment Reply vs DM Reply Tiers — public comment replies default to short/constrained generation regardless of mode; DM replies can be fuller, gated by the messaging-window state machine above.

### DM Automation
- Automated Instagram DMs
- DM Templates
- Dynamic Variables (username, keyword, etc.)
- CTA Links

### Campaign Management
- Create Automation Rules
- Enable/Disable Rules (this *is* campaign status in Phase 1 — a separate status model is Phase 2A)

### Billing — one flat plan, shipped in Phase 1
> Flat-rate pricing *is* the product thesis ([[#Non-Goals (positioning commitments, not omissions)|Non-Goals]]). Deferring all billing to Phase 2 means the first willingness-to-pay signal arrives only after the CRM and the RAG engine are built — the highest-information experiment in the plan, run last. Ship the smallest possible version now.

- Single Flat Plan via Stripe Checkout — one price, one button, one tier. No quotas, no metered ledger, no overage bands; those are [[#Phase 2B — Billing & Monetisation|Phase 2B]]. Cost exposure is already bounded by the per-account AI spend ceiling in Security Foundations.
- Usage is sourced from this phase's event log, so the richer billing in Phase 2B needs no separate tracking mechanism later.

### Analytics
- Total Comments Received
- DMs Sent
- DM Failure Count
- Unique Leads Generated

### Notifications
- Telegram Alerts (Telegram Bot API — see Tech Stack). One channel only in Phase 1; email alerts follow in Phase 2A alongside the CRM.
- New Lead Notifications

### Deferred out of Phase 1 (sequencing, not rejection)
Moved to [[#Phase 2A — Lead Capture & CRM|Phase 2A]]: Top Performing Posts · Top Trigger Keywords · Multiple DM Variations · Email Alerts · Campaign Status Management (as a model distinct from enable/disable) · Campaign-level Analytics (the Analytics section already covers Phase 1's needs) · Exact-vs-Contains as selectable modes · Emoji & Special Character Normalization. (Account Health Monitoring is **not** on this list — see Account & Authentication above; Phase 3's Quality-Rating Monitoring extends it, so it has to exist before Phase 3, not after.)

None of them change whether a pilot creator can run a campaign and get paid for it, which is the only question Phase 1 exists to answer. One is worth naming as deliberate risk: dropping emoji/special-character normalization means a keyword typed with decorative characters may miss. Acceptable at 2–3 pilot accounts, not acceptable at twenty — revisit at the [[#Phase 2A — Lead Capture & CRM|Phase 2A]] boundary, not later.

> **Gate to Phase 2A** — *Metric:* DM send/reply failure rate across pilot campaigns, plus at least one pilot creator converted to the paid flat plan. *Decider:* set the failure-rate threshold once Phase 1 is live on pilot testers and real data exists; don't invent a number before then. *Blocker:* Meta App Review approved for production messaging ([[#Phase 0 — Long-Lead-Time Prerequisites|Phase 0]]).

---

# Phase 2A — Lead Capture & CRM

> Phase 2 in the original plan bundled three unrelated programs — CRM, billing, and the RAG engine — each large enough to be its own phase and each with a different gate. They are split into 2A/2B/2C so they can be sequenced and cut independently. 2A is the smallest and unblocks the other two; **2B and 2C are then parallel, not sequential** — see the note at the end of 2B.

> **Shipped 2026-09-21.** Every feature below is implemented and tested (backend: `deals`/`lead_notes`/`tags`+`lead_tags`/`lead_activity` migrations, `db/deals.ts`/`leadNotes.ts`/`tags.ts`/`leadActivity.ts`/`leadTimeline.ts`, `routes/leads.ts`; frontend: `LeadDetailPage.tsx`, dashboard lead filters, Top Performing Posts/Top Trigger Keywords, campaign editor Reply Variations). Verified end-to-end in a real browser against a live server, not just unit tests — see `claude_fixes/2026-09-21-phase-2a-lead-crm.md`. **Not yet true:** the "Gate to Phase 2A" callout at the end of Phase 1 (App Review approval, a DM failure-rate threshold, one pilot creator converted to paid) — this was built ahead of that gate, at explicit direction, so it's ready in parallel with Phase 0's compliance track rather than blocked on it finishing first. Deliberately deferred within 2A's own scope: **Automatic Tags** (rule-based/AI-driven auto-tagging — only manual tagging shipped; the `lead_tags.source` column already distinguishes 'manual'/'automatic' so this is additive, not a retrofit) and **Live Agent Takeover's reply UI** (a human can pause the bot and the pipeline stops auto-replying, but there's no in-app compose box yet to actually send the human's own reply — they still do that in the Instagram app directly).

### Data Model Amendments (from CRM/Revenue Intelligence architecture review, 2026-09-21)
> Reviewed against `docs/SignalAI_CRM_Revenue_Intelligence_Architecture.docx` (full reference notes and diagrams in `docs/architecture_and_ui_roadmap.md`). Most of that doc's design is already superseded by this roadmap's more detailed, Meta-policy-grounded version of the same ideas — its Spring Boot / Redis suggestions are rejected outright, they contradict the already-shipped Node+TS / pg-boss-on-Neon stack. The `customer_id`/`lead_id` split this review also surfaced was pulled forward into [[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]] Platform Foundations rather than introduced here — it's a "decide now, expensive to retrofit" item by Phase 1's own standard, and cheaper to add while the schema is still small. One gap remains genuinely Phase 2A's:

- **`deals` table, schema now / UI later.** Pipeline Management below currently models pipeline position as a status field on the lead, with deal value not tracked until Phase 4's "manually-entered deal amounts." Create the `deals` table (`id`, `customer_id`, `lead_id`, `stage`, `value`, `currency`, `owner_id`, `won_at`/`lost_at`) in this phase's migrations even though the value-entry UI and revenue reporting stay deferred to Phase 4 — same rationale as deciding Platform Foundations early rather than bolting them on. No reason to pull this into Phase 1 too: Phase 1 has no pipeline/CRM concept at all yet, so there's nothing for a `deals` row to attach to until 2A's Pipeline Management exists.

### Lead Management
- Lead Creation
- Lead Profiles
- Lead Timeline — **extended 2026-09-28**: previously only merged `lead_events` (inbound) and `lead_activity` (CRM actions) — nothing anywhere persisted what the bot actually sent back, so this only ever showed half of every conversation. New `sent_replies` table (one row per actual channel send) now merges in too. Full detail in `claude_fixes/2026-09-28-dm-continuation-and-timeline-replies.md`.
- Lead Activity History
- Lead Search
- Lead Filters

### Conversational CRM
> The differentiator against tag-based competitors: the Milestone Engine's captured facts ([[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]]) already extract budget, email, and intent as typed data, so the deal card moves on semantic analysis of the conversation rather than on the creator manually tagging leads or wiring up a Zapier bridge to HubSpot.

- Lead Status Tracking
- Lead Notes
- Internal Comments
- Lead Ownership
- Lead Assignment
- Automatic Pipeline Movement — driven by milestone advancement, not manual drag

### Tagging System
- Custom Tags
- Automatic Tags
- Lead Segmentation

### Pipeline Management
- New Lead
- Contacted
- Qualified
- Meeting Scheduled
- Won
- Lost

### Carried from Phase 1
- Top Performing Posts
- Top Trigger Keywords
- Multiple DM Variations
- Email Alerts (Resend)

### Human Handoff
- Agent Escalation
- Live Agent Takeover
- Conversation Transfer

> **Gate to Phase 2B** — *Metric:* count of paying accounts on the Phase 1 flat plan, and observed spread in monthly DM/token usage across them. *Decider:* tier boundaries must be drawn from real usage spread, not guessed; if every account looks the same, the flat plan is still the right product and 2B waits.

---

# Phase 2B — Billing & Monetisation

> Extends the single flat plan shipped in [[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]] into a real pricing system.

> **Shipped 2026-09-22**, everything below except the WhatsApp Cost Line sub-item (explicitly Phase 3-gated — no WhatsApp integration or WABA decision exists yet, so it stays exactly as originally scoped). Full writeup in `claude_fixes/2026-09-22-phase-2b-billing.md`. Verified beyond typecheck/tests: full suite (431/431) passing, all 4 new migrations re-tested against a DB with pre-existing rows, and the trial/tier/usage-dashboard UI driven end-to-end through a real browser (Playwright against the live dev server + Postgres) — signup, trial countdown, tier upgrade buttons, and a graceful-failure path against a deliberately invalid Stripe key, all with zero unexpected console errors.
>
> **Two things worth flagging, not silently glossed over:**
> - **`connectedAccounts` in the tier table is informational only, not enforced.** The system only supports one connected Instagram account per tenant today, full stop (`getSoleConnectedAccount` — no multi-account UI or backend exists), regardless of tier. Growth's "3 connected accounts" is a stated future entitlement, not something a Growth tenant can actually use yet — building real multi-account support is its own project, out of this phase's scope.
> - **`campaigns`/`connectedAccounts` quotas have no hard block at creation time.** Only DM/token usage gets soft-cap warnings (Usage Visibility Dashboard) and the trial token allowance gets a real fail-closed block — matching "warn as a tenant approaches their tier limit; don't hard-block mid-campaign." Nothing currently stops a trial tenant from creating a 4th campaign past their stated 3-campaign quota. Add if real pilot usage shows this matters; it didn't seem worth a hard block nobody asked for yet.

- Free Trial Period (time-boxed, full or near-full feature access; converts to a paid tier or downgrades to a locked/read-only state on expiry — decide which before launch)
- Trial Token Allowance — the trial includes a capped token budget, separate from its time window, so a trial account can't run unbounded AI cost
- Trial-Abuse Guardrail — tie trial eligibility to the connected Instagram account / verified identity, not just an email/signup, so one client can't cycle endless free trials
- Plan Tiers (quotas on DMs sent/month, connected accounts, campaigns, included token allowance — **never on stored contacts**, see [[#Non-Goals (positioning commitments, not omissions)|Non-Goals]])
- Stripe Subscription Billing (flat fee per tenant — signalAI's own merchant account, distinct from the client-payment integrations in [[#Phase 4 — Revenue Attribution & Analytics|Phase 4]] and [[#Phase 9 — Enterprise Features|Phase 9]])
- Soft-Cap Quota Enforcement — warn as a tenant approaches their tier limit; don't hard-block mid-campaign, since stranding an active automation reads as a broken product, not a quota. The hard per-account spend ceiling from Phase 1 Security Foundations stays underneath as the backstop.
- Per-Tenant Usage Ledger — LLM input/output tokens recorded per AI call (RAG retrieval + generation), keyed by the same idempotency key as the triggering event ([[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]] event pipeline) so a retry can't double-bill
- Daily Usage Rollup → Stripe Metered Billing — aggregate internally first; sync to Stripe periodically rather than calling it per token event
- Overage Pricing Bands — priced per token band beyond each plan tier's included allowance
- Usage Visibility Dashboard — tenant-facing, so consumption is visible before an invoice, not after
- WhatsApp Cost Line (added in [[#Phase 3 — WhatsApp Automation|Phase 3]]) — **billed to the tenant additionally, as a metered pass-through**, never folded into the plan fee. Tracked separately from AI/token cost: it applies regardless of whether AI is used, and it is not optimizable the way token usage is. What pass-through requires that the AI/token ledger does not already provide:
  - **Meter on delivery, not on send.** Meta charges per *delivered* message, so the ledger must be driven by delivery-status callbacks. Billing off send attempts over-charges the tenant on every failure and is the fastest way to lose trust in the invoice.
  - **Per-category rates, stamped at send time.** Marketing, utility, authentication and service price differently, and utility/authentication carry volume-tier discounts. Store the category *and the rate applied* — rates moved on 1 Jul 2026 and again on 1 Oct 2026, and a retroactively re-priced invoice is indefensible.
  - **Pre-send cost estimate** in the UI before a broadcast ("this send will cost approximately ₹X"), so a pass-through charge is never first seen on an invoice.
  - **Tax treatment** — India adds 18% GST on Meta's charge, and rebilling means signalAI is invoicing its own customer rather than forwarding Meta's. Confirm with an accountant how GST applies to the rebilled line before the first invoice; this is a tax question, not an engineering one.
  - **Credit exposure** — if signalAI is Meta's billed party and rebills monthly in arrears, a tenant who runs a large broadcast and then churns leaves signalAI holding the bill. Needs prepaid credit, a per-tenant spend cap, or card-on-file pre-authorisation before broadcasts open.
  - **Precondition — whose WABA?** All of the above assumes signalAI is Meta's billed party and rebills tenants. If instead each tenant owns their WhatsApp Business Account and payment method, Meta bills them directly, there is nothing to pass through, and this component collapses to a read-only cost display. That fork is settled by the BSP build-vs-buy decision in [[#Phase 3 — WhatsApp Automation|Phase 3]] and must be closed before any of this is built.

> **Note — 2B and 2C are independent, not sequential.** 2C is gated on the Phase 1 signal below, *not* on 2B shipping; billing plumbing must never block the product's differentiator. Run whichever is unblocked first, or both.
>
> **Gate to Phase 2C** — *Metric:* share of AI replies that fail or get rejected by guardrails for want of grounded tenant knowledge, and count of customer requests to upload their own pricing/FAQ material — both measurable from [[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]] onward. *Decider:* RAG is the largest single program in the plan; build it when ungrounded replies are demonstrably the binding constraint, not before.

---

# Phase 2C — Conversational AI Engine (RAG)

> Extends [[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]]'s AI-Generated Reply and Milestone Engine with grounded knowledge; reused by [[#Phase 5 — AI Sales Agent|Phase 5]]'s AI Agent. The largest of the three Phase 2 programs.

> **Slice 1 shipped 2026-09-27** — Per-Tenant Knowledge Base, Tenant-Isolated Retrieval, Client Guardrails, Grounded-Answer-Only Fallback, and Milestone Engine on RAG, all below. Full writeup in `claude_fixes/2026-09-27-phase-2c-slice1-rag-engine.md`. Built ahead of this phase's own gate (see the "Gate to Phase 2C" note above [[#Phase 2B — Billing & Monetisation|Phase 2B]]) — the metric it names (ungrounded-reply rejection rate, FAQ-upload request count) isn't instrumented anywhere in this codebase, and there's no evidence the equivalent Phase 1→2A gate was ever measured either; built at explicit direction, same as 2A, not because the gate was checked and passed.
>
> **Explicitly deferred to a fast-follow, not part of Slice 1:** the entire **Lead Scoring** subsystem below (it reads conversation data this slice produces, so it's a clean separate commit), Intent Detection/Budget Qualification/Location Qualification/Need Assessment as distinct built-in milestone presets (the generic, tenant-configured Milestone Engine already covers these goal shapes; dedicated presets are a smaller follow-up, not new engine code), DOCX/other document formats (PDF + plain text/Markdown only), a pgvector ANN index (an unindexed `tenant_id`-filtered scan is correct and fast enough at pilot scale — an index needs existing rows to train against anyway), and bulk re-embedding on an embedding-model change (a re-upload creates a new version; re-embedding every existing chunk after a model swap is a separate job, out of scope until asked for).

- Per-Tenant Knowledge Base (PDF / Document / FAQ / Product Catalog / Pricing Sheet Upload — versioned, re-embeddable on update)
- Tenant-Isolated Retrieval — vector search filtered by `tenant_id` at the retrieval layer itself, same boundary as [[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]] Platform Foundations; a leak here is a live AI reply exposing another client's data, not just a dashboard bug
- Client Guardrails — configured at onboarding (brand voice, forbidden topics, escalation triggers); layer on top of [[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]]'s Global Guardrails, can only narrow them, never override
- Grounded-Answer-Only Fallback — below-threshold retrieval confidence routes to a generic fallback or Human Handoff instead of a freelanced answer
- Milestone Engine on RAG — milestone advancement checks and steering now draw on retrieved tenant knowledge, so "send pricing" cites the real pricing sheet rather than improvising
- Intent Detection
- Budget Qualification
- Location Qualification
- Need Assessment
- Comment Reply vs DM Reply Tiers — public comment replies: short/constrained, higher guardrail strictness; DM replies: full RAG conversation, gated by the 24-hour messaging window ([[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]])

### Lead Scoring
- AI Lead Score
- Intent Score
- Engagement Score
- Qualification Score
- Custom Scoring Rules

> **Gate to Phase 3** — *Metric:* lead-to-qualified conversion rate through the Conversational AI Engine, measured per milestone. *Decider:* threshold set from this phase's usage data once a full quarter of pilot campaigns has run. Investing in a second channel before this is measured means scaling an unvalidated funnel.

---

# Phase 3 — WhatsApp Automation

> WhatsApp's constraints are structurally different from Instagram's — don't reuse Phase 1's messaging-window logic as-is.
>
> **Pricing change confirmed, and it lands almost immediately — this is the single most time-sensitive item in the roadmap.** Meta moved to per-message billing on 1 Jul 2025 (not per-conversation). Service messages have been free since Nov 2024 and in-window utility messages since 1 Jul 2025 — **both become billable per message on 1 Oct 2026**, with rates published by Meta on 1 Sep 2026.
>
> This is not a marginal cost change, it is a change to the product's shape. signalAI's model is an AI agent holding a multi-turn conversation inside the open 24-hour customer service window — today that window is free, so conversation length costs only tokens. From 1 Oct 2026 every message the agent sends inside it carries a per-message floor cost that no amount of prompt optimisation removes. Consequences to design for:
> - **Reply-count becomes a cost lever ranking above token count.** The [[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]] Milestone Engine already helps here — reaching a milestone in three messages instead of eight is now directly cheaper — but conciseness has to become an explicit generation constraint on WhatsApp, not a style preference.
> - **The WhatsApp Cost Line in [[#Phase 2B — Billing & Monetisation|Phase 2B]] must be live before the first WhatsApp message ships**, not added later; pass-through per-message cost is no longer a marketing-broadcast-only concern.
> - **Re-run the BSP build-vs-buy maths against published Oct 2026 rates**, since a BSP's per-message margin now stacks on a Meta per-message fee that applies to conversational replies too.
> - **India billing:** INR localization opened 1 Jan 2026 and all WABAs must migrate to INR by 31 Dec 2026 or face delivery disruption. Treat that migration as a dated Phase 3 task, not a billing detail.
>
> **India rate card (list rates effective 1 Jul 2026, per delivered message, exclusive of 18% GST):** marketing **₹0.8631** · utility **₹0.1150** · authentication **₹0.1150**. From 1 Oct 2026, service messages (free-form replies inside the customer service window) bill at the utility rate, **₹0.1150** — roughly **₹0.136 delivered** once GST is added. Utility and authentication drop up to ~30% at volume tiers; marketing does not.
>
> **Worked unit economics — the tenant's pass-through line, not signalAI's cost.** A qualified WhatsApp conversation in signalAI's model is one opening marketing template plus a multi-turn agent exchange. At eight agent messages: `₹0.8631 + (8 × ₹0.1150) = ₹1.78`, or **≈ ₹2.10 per engaged lead with GST** — before a single LLM token. A tenant doing 1,000 engaged leads/month carries **≈ ₹2,100/month (~US$24) in pass-through Meta fees alone**.
>
> **Decided: Meta per-message fees are billed to the tenant additionally, as a metered pass-through line separate from the plan fee.** They are never absorbed into the plan price and never bundled into an "included" allowance. The plan price then stays stable regardless of a tenant's message volume, and signalAI's margin stays independent of Meta's rate changes — the 1 Oct 2026 change above reaches tenants as a line-item increase rather than as a margin hit. It is also consistent with [[#Non-Goals (positioning commitments, not omissions)|Non-Goals]]: the meter is per *delivered message*, which tracks value delivered, not per contact stored.
>
> This turns the Milestone Engine's conciseness constraint into a **tenant-facing value proposition rather than a signalAI margin feature** — reaching a milestone in four messages instead of eight halves the tenant's Meta bill, an invoice-visible saving a competitor's flowchart bot cannot claim. Sell it that way. (Correction to the earlier framing above: with pass-through, message count is the *tenant's* cost lever, not ours.)
>
> **Unresolved — verify before pricing.** Secondary sources conflict on whether a free service-message allowance survives the 1 Oct change: some report 1,000 free service messages per business phone number per month, others state the 1,000 figure belonged to the conversation-based model Meta retired in July 2025 and that no free allowance exists under per-message billing. This changes the small-tenant economics materially. Resolve it against Meta's own INR rate-card CSV/PDF (linked from the WhatsApp Business Platform pricing docs), not against aggregator blogs — the rates above are likewise secondary-sourced and should be confirmed the same way.
>
> Build-vs-buy decision point: a WhatsApp BSP (Twilio/Wati/Zoko) instead of Meta's raw Cloud API can absorb most of the Template Lifecycle Manager and Quality-Rating Health Monitoring work below into their dashboard/API, at the cost of a per-message margin. Given solo/small-team engineering bandwidth is the real constraint, decide this deliberately rather than defaulting to the raw API out of habit. Do **not** use unofficial/session-based (web-scraping) WhatsApp automation as a lower-barrier alternative — see [[#Non-Goals (positioning commitments, not omissions)|Non-Goals]].

### Identity Resolution — Instagram → WhatsApp
> The IG-to-WA handoff is where every competitor drops context: the customer clicks a WhatsApp link and the bot restarts cold with "Hi, what's your name?". Closing that gap is the single most valuable piece of technology in the product, and it is an *identity* problem, not a messaging problem.

- Signed Handoff Token — the click-to-WhatsApp link carries a signed, short-lived `ref` payload that resolves to the existing `lead_id` on the identity spine ([[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]]). The first inbound WhatsApp message arrives already attached to the lead, with the captured facts and active milestone intact.
- Phone-Number Attachment — the verified WhatsApp number attaches to the existing `lead_id` as an additional channel handle, never as a new lead. This is what turns an anonymous Instagram username into a contactable, CRM-resident record — the proprietary data graph the product is ultimately valued on.
- Token Replay & Collision Handling — a `ref` token is single-use and expiring; a second person clicking a forwarded link must not inherit the first lead's conversation or PII.
- Cold-Start Fallback — a WhatsApp message arriving with no valid token starts a new lead cleanly rather than guessing at a match on phone number alone.

### WhatsApp Foundations
- Template Lifecycle Manager — per-tenant template catalog with submission/approval-status tracking, categorized Utility/Authentication vs. Marketing (Marketing carries opt-out and quality-rating exposure the others don't). Approval is per-template (minutes–48h), not a one-time app-level review like Meta's Instagram App Review — build this as a recurring workflow.
- Opt-in Gate on Broadcast — consent flag + timestamp checked at send time, not just collected as a data field; broadcasting to non-opted-in contacts can crash quality rating from High to Low overnight and cap the account's sending tier.
- Quality-Rating Health Monitoring — extend Phase 1's Account Health Monitoring to WhatsApp numbers; auto-throttle/pause broadcast sends if rating drops rather than letting a client silently damage their own tier.
- Cross-Channel Context Carryover — the [[#Phase 2C — Conversational AI Engine (RAG)|Phase 2C]] engine resumes on the `lead_id` resolved above: same intent, same qualification progress, same active milestone. The engine stays channel-agnostic by design rather than needing a special case per channel.
- Non-Guaranteed Broadcast Delivery — confirmed: Meta caps each individual user to **2 marketing template messages per 24h across every business on the platform combined**, not 2 per business. Over-cap sends fail with Cloud API error **131049** rather than queueing, so Broadcast Campaigns must be designed for partial delivery and must surface 131049 as "capped by Meta", not as a generic failure the client reads as our bug.
- Reply-Unlocks-the-Cap — the cap only governs marketing templates that would *open* a conversation; once the user replies, free-form messages flow without limit. This is a structural advantage for signalAI over broadcast-first tools: the [[#Phase 2C — Conversational AI Engine (RAG)|Phase 2C]] engine's job is to earn a reply on message one, after which the conversation is uncapped — note the window stops being *free* on 1 Oct 2026, so the advantage is the removed cap, not a removed cost. Make "reply rate on first template" a first-class campaign metric, not a vanity stat.

### WhatsApp Integration
- WhatsApp Business API Integration
- WhatsApp Opt-in Collection
- WhatsApp Contact Sync

### WhatsApp Messaging
- Automated Follow-ups
- Broadcast Campaigns
- Reminder Messages
- Promotional Messages

### Multi-Step Follow-ups
- Day 1 Follow-up
- Day 3 Follow-up
- Day 7 Follow-up
- Custom Follow-up Sequences

### AI Follow-up Assistant
- Follow-up Recommendations
- Automatic Re-engagement
- Inactive Lead Recovery

> **Gate to Phase 4** — *Metric:* combined Instagram + WhatsApp leads reaching the Pipeline per month, and count of deals marked Won. *Decider:* attribution needs enough Won events to be statistically meaningful rather than anecdotal; threshold set once WhatsApp has run a full month.

---

# Phase 4 — Revenue Attribution & Analytics

> V1 runs off Pipeline "Won" stage transitions ([[#Phase 2A — Lead Capture & CRM|Phase 2A]]) with manually-entered deal amounts. **Payment-webhook ingestion (Stripe / Razorpay checkout events on the *client's* account) is pulled into this phase** — it is cheap relative to the HubSpot/Salesforce connectors it was originally bundled with in Phase 9, and it is precisely what this phase is otherwise waiting on. The full CRM integrations stay in Phase 9.

### Payment Event Ingestion
- Client Stripe / Razorpay webhook connection
- Payment event → `lead_id` matching (via email/phone captured by the Milestone Engine)
- Manual deal-amount entry retained as fallback for offline/cash sales

### Revenue Tracking
- Revenue Per Lead
- Revenue Per Campaign
- Revenue Per Reel
- Revenue Per Post

### Funnel Analytics
- Reach
- Comments
- DMs
- Leads
- Qualified Leads
- Meetings
- Sales
- Revenue
- Per-Milestone Drop-off (from [[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]] Milestone Analytics) — the view that tells a creator *where* the funnel leaks, not just that it does

### Attribution System
- First Touch Attribution
- Last Touch Attribution
- Multi-touch Attribution
- **Confidence / Evidence-Coverage Labeling** (from architecture review, see Phase 2A Data Model Amendments) — every attribution result and every cross-channel identity match (Phase 3 Identity Resolution) carries an explicit confidence label (e.g. `HIGH` / `unconfirmed` / `probabilistic`) rather than being presented as certain. Applies directly to the `customer_id` merges introduced in Phase 2A: an uncertain match stays a suggested merge, never a silent one.

### Business Dashboards
- ROI Dashboard
- Conversion Dashboard
- Revenue Dashboard
- Growth Dashboard

### Reports
- Daily Reports
- Weekly Reports
- Monthly Reports
- Export Reports

> **Gate to Phase 5** — *Metric:* total Won-deal value attributed through the platform per month. *Decider:* a full AI sales agent is only worth building over human-handled conversations once attributed revenue shows the conversations are worth automating; threshold set from the first quarter of attribution data.

---

# Phase 5 — AI Sales Agent

> Knowledge Base, guardrails, milestone steering, and Human Handoff already live in [[#Phase 2C — Conversational AI Engine (RAG)|Phase 2C]] and [[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]] — this phase extends that engine with sales-specific capability rather than rebuilding it.

### AI Agent
- FAQ Handling
- Product Recommendations
- Pricing Responses (grounded in the tenant Knowledge Base from Phase 2C)
- Objection Handling
- Sales Conversations

### Appointment Booking
- Google Calendar Integration
- Calendly Integration
- Zoom Integration
- Google Meet Integration

> **Gate to Phase 6** — *Metric:* single-tenant retention (monthly churn) and active-campaign count per tenant. *Decider:* agency/multi-tenant investment is only justified once single-tenant accounts demonstrably stick; threshold set from the first two quarters of paid retention data.

---

# Phase 6 — Agency Platform

### Multi-Tenant System
- Agency Accounts
- Client Accounts
- Workspace Isolation (built on the `tenant_id` foundation from [[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]] — see Platform Foundations)

### Team Management
- User Management
- Role-Based Access Control
- Permissions Management

### White Labeling
- Custom Domain
- Custom Branding
- Custom Emails
- Custom Login Portal

### Agency Dashboard
- Client Overview
- Client Analytics
- Client Billing
- Client Performance Reports

> **Gate to Phase 7** — *Metric:* count of inbound requests for channels beyond Instagram + WhatsApp, from paying accounts. *Decider:* build omnichannel against real requests; threshold is a request count, not a revenue figure.

---

# Phase 7 — Omnichannel Expansion

### Facebook
- Facebook Comment Automation
- Facebook Messenger Automation
- Facebook Lead Capture

### Telegram
- Telegram Bot Integration
- Telegram Lead Capture
- Telegram Campaigns

### Email Marketing
- Email Capture
- Email Campaigns
- Email Sequences
- Email Analytics

### Unified Inbox
- Instagram Messages
- WhatsApp Messages
- Facebook Messages
- Telegram Messages
- Email Messages

### Unified CRM
- Cross-channel Lead Tracking
- Unified Customer Profiles (the identity spine from [[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]], now with four handles hanging off each `lead_id`)
- Channel Attribution

> **Gate to Phase 8** — *Metric:* volume of completed conversations and Won deals across all channels. *Decider:* predictive features need enough history to be trainable rather than speculative; threshold is a row count, set once omnichannel has run a quarter.

---

# Phase 8 — Advanced AI & Intelligence

### AI Insights
- Best Performing Content Detection
- Best Performing Keywords
- Lead Quality Analysis
- Revenue Trend Analysis

### Predictive Analytics
- Lead Conversion Prediction
- Revenue Forecasting
- Churn Prediction

### AI Recommendations
- Suggested Keywords
- Suggested Follow-ups
- Suggested Milestones (proposed from campaigns whose milestone drop-off is lowest)
- Suggested Campaign Improvements
- Suggested Content Topics

### AI Content Generation
- DM Generation
- Follow-up Generation
- CTA Generation
- Lead Magnet Suggestions

> **Gate to Phase 9** — *Metric:* count of enterprise-tier prospects who have explicitly asked for SSO, audit logs, or a public API. *Decider:* build enterprise features against real requests, never speculatively.

---

# Phase 9 — Enterprise Features

### API Platform
- Public APIs
- Webhooks
- Developer Portal
- API Keys

### Integrations
- HubSpot
- Salesforce
- Zoho CRM
- Pipedrive
- (Stripe / Razorpay payment-event ingestion already landed in [[#Phase 4 — Revenue Attribution & Analytics|Phase 4]]; this phase adds full two-way CRM sync)

### Security
- SSO
- Audit Logs
- IP Restrictions
- Data Retention Policies

### Compliance — extends, does not introduce
> Consent capture, the data-deletion callback, and PII scrubbing already shipped in [[#Phase 1 — MVP: Instagram Comment Automation|Phase 1]] Platform Foundations, because Meta App Review required them. This phase formalises them for enterprise procurement rather than building them.

- GDPR Support (DSAR export, lawful-basis records)
- User Data Deletion — enterprise-facing surface over the Phase 1 hard-scrub machinery
- Consent Management — granular, per-purpose consent over the Phase 1 capture
- Privacy Controls

> **Gate to Phase 10** — *Metric:* churn and support load on the core CRM/automation product. *Decider:* creator-monetization features are additive only once the core product is stable enough not to need the attention; threshold is a stability bar, not a growth one.

---

# Phase 10 — Creator Growth Platform

### Link-in-Bio Builder
- Landing Pages
- Lead Capture Pages
- Funnel Pages

### Digital Product Delivery
- Ebook Delivery
- Course Delivery
- File Delivery

### Community Features
- Subscriber Lists
- Broadcast Channels
- Membership Management

### Monetization Tools
- Payment Links
- Subscription Management
- Affiliate Tracking
- Referral Programs

### Creator Growth Analytics
- Audience Growth Tracking
- Content Performance Tracking
- Revenue Growth Tracking
- Customer Lifetime Value Tracking
