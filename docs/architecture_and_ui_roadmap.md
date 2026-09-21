# Architecture Reference & UI/UX Roadmap

Source material: `docs/SignalAI_CRM_Revenue_Intelligence_Architecture.docx` (external CRM/revenue-intelligence architecture review), read in full and reconciled against `docs/signalAI_roadmap.md` and the shipped schema on 2026-09-21. This file keeps what's worth keeping from that review — diagrams, data-model reference, UI mockups, and a UI/UX roadmap derived from them — so the source `.docx` doesn't need to stay in the loop. The roadmap amendments that came out of this review live in `docs/signalAI_roadmap.md` itself: the Customer/Lead split under Phase 1 Platform Foundations (pulled forward from an original Phase 2A draft — it's a "decide now" item by Phase 1's own standard), and the `deals` schema plus attribution confidence labeling under Phase 2A/Phase 4. This file is reference material, not a second roadmap.

**Corrections applied below:** the source doc's suggested backend (Spring Boot) and cache/coordination layer (Redis) are dropped from the diagrams — they contradict the already-decided and already-shipped stack (Node.js/TypeScript, pg-boss on Neon Postgres, no Redis; see `signalAI_roadmap.md` Tech Stack). Everything else is preserved close to the original, since it's system-shape-level and stack-agnostic.

---

## 1. Target Architecture

The CRM sits in the middle of the system, not at the end. Channels generate events; the identity graph turns those events into a coherent customer history; the CRM gives humans a place to manage the lead; the lifecycle engine automates the next action; and attribution/analytics convert the event history into business outcomes.

```
   Instagram        WhatsApp        Razorpay / Stripe
       |                |                   |
       +--------- Meta Webhooks ------------+
                        |
                        v
                 Event Gateway
                        |
                        v
                  Event Store            <-- lead_events (already shipped)
                        |
                        v
                 Identity Graph          <-- customer_id / lead_id spine
                        |
                        v
                  SignalAI CRM
                        |
          +-------------+-------------+
          |             |             |
          v             v             v
      Lifecycle    Attribution    Analytics
       Engine         Engine        Engine
          |             |             |
          +-------------+-------------+
                        |
                        v
                  BI Dashboard
```

## 2. Suggested Technical Architecture (corrected to the shipped stack)

```
              Channel Adapters
   +------------------------------------+
   | Instagram | WhatsApp | Web | Razorpay |
   +------------------+-------------------+
                       |
                       v
                Event Gateway (Express webhook handlers)
                       |
          +------------+------------+
          |                         |
          v                         v
   Raw Event Store          Event Normalizer
   (lead_events)                   |
                                    v
                          Identity Resolver
                                    |
                                    v
                        Customer / Lead Store
                       (leads, lead_pii, deals)
                                    |
              +---------------------+---------------------+
              |                     |                      |
              v                     v                      v
        CRM Service          Lifecycle Engine       Attribution Engine
      (Express routes)      (pg-boss workers,        (Phase 4 batch/
                              key_strict_fifo,          read model)
                              singletonKey=lead_id)
              |                     |                      |
              +---------------------+---------------------+
                                    |
                                    v
                             Analytics API
                                    |
                                    v
                            React Dashboard (SPA)
```

Component choices (differs from the source doc where noted):
| Component | Choice | Why |
|---|---|---|
| API / backend | Node.js + TypeScript, Express | Already shipped; source doc's "Spring Boot" suggestion rejected — no reason to fork the stack |
| Primary DB | PostgreSQL (Neon) | Relational CRM/deal model + JSON metadata (`attributes jsonb` on `lead_events`) |
| Queue / coordination | `pg-boss` on the same Neon DB | Source doc suggested Redis; rejected — pg-boss avoids a second paid service, already shipped in `server/src/queue` |
| Event ingestion | Webhook endpoints + `lead_events` + pg-boss workers | Durable pipeline already shipped (Phase 1 Platform Foundations) |
| Vector store | `pgvector` in the same Postgres | For Phase 2C RAG; no separate vector DB |
| Object storage | Cloudflare R2 | Knowledge base uploads, exports |
| Frontend | React (SPA), static-hosted | Already shipped |

## 3. End-to-End Customer Journey (illustrative)

```
Instagram Reel
     |  User comments: "PRICE"
     v
Meta webhook
     |
     v
SignalAI creates Lead L-82931
     |  source_content_id = reel_9834, campaign_id = campaign_17
     v
SignalAI sends DM / CTA
     |  tracked WhatsApp entry point
     v
WhatsApp conversation
     |  inbound message / phone identity
     v
Customer C-1001 resolved
     |
     +--> Lead marked QUALIFIED
     +--> salesperson assigned
     |
     v
Salesperson works lead in SignalAI CRM
     +--> call logged
     +--> demo booked
     +--> deal created: INR 80,000
     |
     v
Payment received (e.g. Razorpay webhook)
     |
     v
Revenue event linked to C-1001 / Deal D-9281
     |
     v
Attribution: Reel #9834 -> qualified lead -> deal -> INR 80,000
```

## 4. Core CRM Data Model (reference)

| Entity | Purpose | Key fields |
|---|---|---|
| Customer | Canonical person/company identity | `id`, `name`, `phone`, `email`, `created_at`, `lifecycle_status` |
| Identity | External identity that may refer to the same customer | `customer_id`, `provider`, `external_id`, `phone`, `email`, `metadata` |
| Lead | A business acquisition instance / lead record | `id`, `customer_id`, `source`, `campaign_id`, `source_content_id`, `status`, `owner_id`, `created_at` |
| Conversation | A channel-specific conversation | `id`, `customer_id`, `channel`, `external_thread_id`, `started_at`, `last_message_at`, `status` |
| Deal | Commercial opportunity and outcome | `id`, `customer_id`, `lead_id`, `stage`, `value`, `currency`, `owner_id`, `won_at`/`lost_at` |
| Event | Immutable record of an action or observation | `id`, `customer_id`, `lead_id`, `type`, `timestamp`, `source`, `metadata` |

Mapping to what's shipped: `Lead` + `Identity` + `Event` already exist as `leads` / `lead_pii` / `lead_events`. `Customer` is added in Phase 1 Platform Foundations (a minimal `customers` table, minted 1:1 with each lead for now); `Deal` is added in Phase 2A ("Data Model Amendments") once Pipeline Management gives it something to attach to.

## 5. Lead Lifecycle (reference granularity)

```
NEW -> ENGAGED -> QUALIFIED -> CONTACTED -> OPPORTUNITY -> NEGOTIATION -> WON / LOST -> CUSTOMER -> REPEAT CUSTOMER
```

Roadmap's Phase 2A Pipeline (`New Lead / Contacted / Qualified / Meeting Scheduled / Won / Lost`) is a coarser version of this. Worth revisiting at the Phase 2A UI design stage — not a schema change, just more pipeline-stage granularity if pilot usage shows the coarser version hides where deals actually stall.

---

## 6. UI/UX Roadmap

Concrete UI surfaces implied by the architecture above, sequenced against the phases that already own each feature in `signalAI_roadmap.md`. This section is the answer to "what should these phases actually look like on screen" — it doesn't add new phases or gates.

**Design inspiration reference:** check [21st.dev](https://21st.dev/) for component/layout ideas when building these — it's a library of ready-made React/Tailwind UI components, useful for the CRM inbox, pipeline board, and dashboard surfaces below rather than building each from scratch.

### Phase 2A — Lead Inbox & Customer 360
- **Sales Inbox** — single-lead working view: source (Reel/campaign), captured facts (budget, milestone progress), lead score, status, owner, and quick actions (`Call`, `WhatsApp`, `Schedule Visit`). Post-call outcome buttons (`Interested`, `Follow-up`, `Not Interested`, `Demo Booked`) should write directly to `lead_events` — event capture as a by-product of normal work, not a separate reporting step.
- **Customer 360 / Lead Profile** — timeline view merging `lead_events` into a single scrollable history (Reel engagement → comment → DM → WhatsApp entry → qualification → call → demo → deal → payment), plus an attribution panel (first-touch source, campaign, revenue, evidence coverage — see §6 Phase 4 below).
- **Pipeline board** — Kanban over the Pipeline Management stages, drag-to-advance mirrored by an `Automatic Pipeline Movement` event when it's milestone-driven rather than manual.

```
Rahul Sharma
==================================================
Source: Instagram Reel #92384   Campaign: September Property Campaign
Lead score: 87   Owner: Amit   Status: Negotiation
CUSTOMER JOURNEY
--------------------------------------------------
09/20 10:31  Reel engagement
09/20 10:34  Comment: "PRICE"
09/20 10:35  Private reply / DM
09/20 10:38  WhatsApp entry
09/20 10:39  Qualification complete
09/20 10:45  Assigned to Amit
09/21 11:20  Sales call
09/23        Demo completed
09/24        Deal created - INR 80,000
09/29        Payment received - INR 80,000
ATTRIBUTION
--------------------------------------------------
First touch: Reel #92384   Campaign: September Property Campaign
Revenue: INR 80,000        Evidence coverage: HIGH
```

### Phase 4 — Revenue & Attribution Dashboards
- **Revenue-by-Reel/Post/Campaign table** — the dashboard's headline view; each row needs a visible confidence/evidence-coverage indicator (per the Attribution System amendment in `signalAI_roadmap.md`), not just a number, so a low-confidence attribution doesn't read as fact.
- **Funnel view** — Reach → Comments → DMs → Leads → Qualified → Meetings → Sales → Revenue, with per-milestone drop-off overlaid (feeds from Phase 1's Milestone Analytics).
- **"Where is data missing" panel** — unattributed revenue, unmatched identities, leads without outcomes. Make missing data visible rather than silently excluded — matches the roadmap's "fail closed / show the gap" posture used elsewhere (AI spend ceiling, guardrails).

```
Reel          Leads   Deals   Revenue    Lead -> Customer
Reel #92384    82      11     INR 6.4L        13.4%
Reel #94821    41       7     INR 4.1L        17.1%
Reel #95127    93       3     INR 1.2L         3.2%
```

### Cross-phase UI principles worth stating explicitly
- **Never silently merge identities in the UI.** A probabilistic Customer match surfaces as a suggested merge action, not an auto-merge — matches the Phase 1 `customer_id` foundation.
- **Manual capture is first-class, not a fallback screen.** Offline/cash sales and manually-logged calls use the same Sales Inbox actions as automated events, not a separate "legacy data entry" form.
- **Every AI-authored reply surface (comment/DM preview) shows the active milestone** it's steering toward, for the creator reviewing campaign behavior — makes the Milestone Engine's steering legible instead of a black box.

---

## 7. Other Reference Material from the Source Doc

### Data-quality / limitations rules
| Risk | Correct product behavior |
|---|---|
| Offline sale not integrated | Allow manual deal/revenue recording |
| Instagram and WhatsApp identities cannot be confidently linked | Keep separate identities; suggest a merge instead of silently merging |
| Payment exists but customer matching is ambiguous | Mark revenue as unattributed / partially matched |
| Salesperson does not update CRM | Show missing-outcome dashboards and reminders; do not invent the outcome |
| Attribution model changes | Store the model/version and make reports reproducible |
| Event arrives twice | Use provider event IDs + idempotency keys — already shipped (`lead_events.meta_event_id` unique index) |
| Webhook arrives out of order | Use event timestamps and lifecycle reconciliation — already shipped (`last_applied_sequence` frontier) |
| Privacy / platform policy constraints | Collect only necessary data and design around each channel's permissions and retention rules |

### Product success metrics (candidates for Phase 4 gate metrics)
- % of leads with a resolved customer identity
- % of leads with a known lifecycle outcome
- % of revenue linked to a source
- Median time from lead creation to first human action
- Lead → qualified conversion
- Qualified → won conversion
- Revenue per lead
- MRR per connected account
- Weekly active sales users

### What NOT to build (source doc's own scope discipline — consistent with this roadmap's Non-Goals)
- A generic drag-and-drop automation platform with hundreds of node types
- A full HubSpot clone (marketing, service, CMS, ticketing, content tools)
- A generic team inbox for every messaging channel
- A giant reporting suite with dozens of vanity metrics
- An attribution engine that claims causal certainty where the evidence is weak
- A deep integration catalog before the three or four highest-value integrations are validated
