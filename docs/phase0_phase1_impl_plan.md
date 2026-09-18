# signalAI — Phase 0 + Phase 1 Implementation Plan

Companion to [[signalAI_roadmap]]. The roadmap says *what* and *why*; this says *in what order*, *what blocks what*, and *how you know a step is done*.

---

## The structural fact this plan is built around

**Two tracks run in parallel and only join at launch.**

- **Track A — Access** (Phase 0) is calendar-bound: entity registration, Business Verification, App Review. You cannot compress it by working harder; it moves at the speed of other people's queues. It is the critical path to *revenue*.
- **Track B — Engineering** (Phase 1) is effort-bound and, crucially, **can be built and validated end-to-end without Track A finishing**. App users with a role on the Meta app can be messaged in Development Mode with no Advanced Access, so 2–3 pilot creators give you real campaigns on real Reels while App Review is still queued.

Treating these as sequential is the single most expensive mistake available here: it converts a ~2-month engineering effort plus a parallel ~2-month approval into a ~4-month serial wait with no product learning in the middle.

**One cross-dependency, and it runs backwards from the obvious direction:** Track A's App Review submission requires live, reachable Privacy Policy, Terms, and Data Deletion Callback URLs. Those are Track B artifacts. So **B0–B1 must land before A4 can be submitted**, which is why the deploy skeleton and the compliance endpoints are the first engineering work, ahead of anything that looks like product.

```
Track A   A1 entity ──> A2 verification ──────> A4 submit ──> A5 iterate ──> APPROVED
                                                  ^                              │
                                                  │ needs live URLs              │
Track B   B0 skeleton ─> B1 compliance ──────────-┘                              │
                          └─> B2 data ─> B3 ingress ─> B4 worker ─> B5 auth ─>   │
                              B6 campaigns ─> B7 replies ─> B8 milestones ─>     │
                              B9 send ─> B10 caps ─> B11 billing ─> PILOT ───────┴─> LAUNCH
```

Sizes below are solo-dev estimates: **S** ≤ 1 day · **M** 2–4 days · **L** 1–2 weeks. No dates — your availability is the variable I don't have.

The diagram above doesn't show **BUI** (creator-facing UI) or A3/A6 — BUI runs alongside B5 through B11 rather than at a fixed point in the chain (see BUI below and sequencing rule 6); A3 and A6 have no engineering dependency and just need to happen during A1–A2's waiting time.

---

# Track A — Access (Phase 0)

> Start every item on day one that has no dependency. Nothing here is interesting work, and all of it blocks money.

### A1 · Legal entity — **start today, longest pole** (L, mostly waiting)
Meta Business Verification requires business documentation; an unregistered individual cannot complete it. In India the practical options, fastest to slowest:

| Option | Lead time | Notes |
|---|---|---|
| Sole Proprietorship + GST registration | days–2 weeks | Cheapest and fastest. GST certificate is generally accepted as business documentation. No liability separation. |
| One Person Company (OPC) | 2–4 weeks | Liability separation, higher compliance burden. |
| Private Limited | 3–6 weeks | Only worth it if you intend to raise or hire. |

**Decision to make now, not later:** if you expect to stay solo and bootstrapped through Phase 3, sole proprietorship with GST is sufficient and the extra weeks buy nothing. If external funding is plausible within a year, registering Pvt Ltd now is cheaper than converting later.

- **Confirm with a CA before filing** — entity choice interacts with the GST-on-rebilled-Meta-fees question in Phase 2B, and that is a tax question, not an engineering one.
- **Done when:** you hold a registration certificate plus a business address proof, and a current account in the business name.

### A2 · Meta Business Verification (M, then waiting)
- Depends on A1.
- Prepare: registration certificate, address proof, and in some flows a bank statement or utility bill in the business name.
- **Done when:** Business Manager shows Verified.

### A3 · Domain + hosted identity (S)
- Buy the domain (~₹900–1,100/yr). Needed for app URLs and commonly for verification.
- Set up email on the domain — App Review correspondence to a free mailbox looks unserious and is one of the cheap ways to draw scrutiny.
- **Done when:** domain resolves and business email sends/receives.

### A4 · App Review submission (M)
- Depends on A2 **and on B1** (live Privacy Policy, Terms, Data Deletion Callback).
- Request `instagram_business_manage_messages`. The auth path is already decided — Instagram API with Instagram Login, no Facebook Page link.
- Assemble: screencast of the complete user journey (connect account → create campaign → comment triggers → DM sent), a written justification per permission, and working test credentials.
- **Write the screencast to the reviewer, not to a customer.** Reviewers reject for "could not reproduce" far more often than for policy. Show the whole loop, slowly, with the permission's use visible.
- **Done when:** submitted.

### A5 · Review iteration (M, repeatable)
- Budget **at least two rounds**. First-submission rejection is the norm, not the exception.
- Keep a rejection log — reasons repeat, and the second submission should visibly address the first rejection's text.
- **Done when:** Advanced Access granted for production messaging.

### A6 · Pilot creator recruitment (M) — *do this during A1–A2 waiting time*
- Target 2–3 creators in the 10k–50k follower range already using comment-to-DM automation (they are visibly pre-qualified: they already believe in the category).
- Add each as a **tester role on the Meta app** — this is what unlocks messaging them in Development Mode.
- Set expectations explicitly: free during pilot, you will watch their campaigns, you need their feedback.
- **Done when:** 2+ creators have accepted a tester role and connected an account in dev mode.

---

# Track B — Engineering (Phase 1)

## B0 · Skeleton and deploy pipeline (M)
Nothing else can be verified until something is deployed and reachable by Meta.

- Node + TypeScript service, Dockerized; React SPA static-hosted.
- Render **Starter ($7/mo) from the start** — not free tier. A spun-down instance reads to Meta as a failed delivery, and sustained failures can get the webhook subscription disabled outright.
- Neon Postgres provisioned; migration tooling wired in; CI running typecheck + tests on push.
- Sentry initialised before the first real request, not after the first incident.
- **Done when:** a commit to main reaches a public HTTPS URL without manual steps.

## B1 · Compliance endpoints — **unblocks A4, so it comes before product** (M)
- Privacy Policy and Terms pages, publicly reachable.
- **Data Deletion Callback** implementing Meta's signed-request flow, returning the confirmation code and a status URL. It must genuinely delete, because you will demonstrate it.
- Consent capture recorded at account connection with a timestamp.
- **Done when:** all three URLs are live and the deletion callback round-trips against a real signed request. **Tell Track A immediately — A4 is now unblocked.**

## B2 · Data model and migrations (L)
Everything downstream inherits these decisions, and all of them are expensive to retrofit.

- `tenant_id` on every customer-data table from **migration 1**, enforced in one data-access layer or via row-level security.
- **Identity spine:** `lead_id` minted at first contact; `instagram_user_id` (later `whatsapp_phone`) hang off it as channel handles. Build this now even though Phase 1 has one channel — Phase 3 resolves against it.
- **Event log:** structural facts only — timestamps, event type, `lead_id`, counts, sequence numbers. Unique on Meta's event ID for idempotency.
- **PII table:** comment/DM text, username, phone — separate, keyed by `lead_id`, so deletion can hard-scrub content while leaving `lead_id`, timestamps and foreign keys intact for attribution and billing.
- **Token vault:** Meta access tokens envelope-encrypted with a key held outside the database. This is the highest-value table in the system.
- **Done when:** migrations run clean from empty; a scripted deletion scrubs PII while analytics rows still reconcile.

## B3 · Webhook ingress (M)
- `hub.verify_token` subscription handshake.
- **`X-Hub-Signature-256` validation on every payload** — the endpoint is public and this is the only thing standing between an attacker and your source-of-truth event log.
- Handler does exactly two things: persist the raw event, ack. No processing, no LLM calls, no sends.
- **Done when:** a forged payload is rejected, a duplicate event ID is a no-op, and p99 ack latency is comfortably inside Meta's timeout.

## B4 · Worker and queue (L) — DONE, load test passed
- pg-boss **12.x**, `key_strict_fifo`, `singletonKey = lead_id` — per-lead ordering, cross-lead parallelism, no new infrastructure.
- `last_applied_sequence` per lead; events older than the frontier are logged but produce no state-mutating side effects. **Advance the frontier only after the handler succeeds, never before** — advancing first was a real bug found here: it made a retry of a genuine failure indistinguishable from a stale duplicate, so the retry silently no-opped instead of ever reaching the DLQ. Caught by a regression test, not by inspection — this class of bug is easy to write and easy to miss reading the code.
- **Dead-letter path with an alert.** Under `key_strict_fifo` a failed job blocks its own key — one permanently-failed event stalls that lead's conversation indefinitely. Without a DLQ and an operator action to clear a wedged `lead_id`, a lead silently goes dark mid-conversation and nothing tells you.
- **Load test result: ship pg-boss's own defaults (`batchSize: 1`, `localConcurrency: 1`) for Phase 1 — every tuning attempt tried introduced a real duplicate-processing bug.** Two configs were tried to fix the default's ~0.5 jobs/sec:
  - `localConcurrency: 10` reached 297 jobs/sec but duplicated processing — sequence `1` ran three times before `2`/`3` ran at all. Multiple independent polling loops racing on `key_strict_fifo`'s "eligible head" computation, most likely.
  - `batchSize: 50` (concurrency back to 1) reached 25 jobs/sec, passed several repeated runs, then **failed the identical way on a later run** — same `[1,1,1,2,3]` pattern, intermittently. The common thread in both failures: one key with a *deep backlog* (3 queued jobs for the same lead) is exactly the scenario `key_strict_fifo`'s "one eligible head per key" guarantee did not reliably hold for once batch size moved off 1 — a different, worse-suited shape than the "many keys, one job each" spike this policy is actually tuned for.
  - Reverting to true defaults (`batchSize: 1`, `localConcurrency: 1`) passed the same ordering test **five consecutive full runs with no failures** — the only configuration verified reliable, not just fast.
  - **Is ~0.5 jobs/sec actually a problem? No, at pilot scale.** It exceeds Meta's own 750/hour (~0.2/sec) private-reply ceiling per account, which is the real constraint on how fast replies can go out regardless of internal queue speed. **Caveat worth watching, not solving today:** that comparison is per-account; with several pilot creators simultaneously near their individual limits, *aggregate* demand across all of them could exceed this queue's shared ~0.5/sec drain rate before any single account hits its own ceiling. A duplicate send is a worse failure than a delayed one, so the decision is to accept that risk at 2–3 pilot creators and monitor for it (queue lag alongside Account Health Monitoring) rather than retune into a bug that's already been demonstrated twice.
  - Advisory-lock-on-standard-queue remains the fallback if pilot data shows aggregate lag is real — not attempted here, since it's a bigger change than the session had room to also verify properly.
- Reconciliation poller to backfill events a dropped webhook would otherwise lose silently.
- **Done when:** the spike test passes, ordering holds per lead under concurrency, and a poisoned job lands in the DLQ and fires an alert instead of wedging a lead forever. — verified against a real migrated Postgres: strict per-lead ordering, cross-lead concurrency, DLQ + alert on permanent failure, and the retry-vs-stale regression all pass (`src/queue/__tests__/leadEventsQueue.test.ts`, `scripts/loadTestLeadEventsQueue.ts`).

## B5 · Account connection (M)
- Instagram Business Login (Instagram API with Instagram Login). No Facebook Page step.
- Token storage via the B2 vault; refresh handling with a job that renews ahead of expiry.
- **Account Health Monitoring** — surfaces token validity, refresh failures, and connection status; feeds a Telegram alert (B11) rather than being discovered by a human. Pulled back into Phase 1 because Phase 3's Quality-Rating Health Monitoring extends this same mechanism for WhatsApp numbers, so it must already exist by then.
- **Done when:** a pilot creator connects in dev mode, the app receives their comment webhooks, and a forced token failure fires a Telegram alert within a minute.

## B6 · Campaigns and matching (M)
- Campaign CRUD; enable/disable (this *is* status in Phase 1).
- Case-insensitive contains-match, multiple keywords per campaign. One matching mode — not a configurable set.
- Duplicate event protection leans on B3's idempotency rather than reimplementing it.
- **Done when:** a real comment on a pilot's Reel creates a lead and a queued job.

## B7 · Reply engines (M)
Build **rule-based first**. It is not the lesser product mode — it is the fail-closed path for B10's spend ceiling and for provider outages, so nothing downstream is safe until it exists.

- Rule-based: pattern → pre-written reply, plus a default.
- AI-generated: swappable provider behind a config-driven interface. Choose a hosted provider on **structured-output reliability** above price — B8 depends on parseable state transitions, not prose.
- **Global Guardrails + Output Validation**, and **untrusted-input isolation**: comment text is attacker-controlled input flowing into a prompt whose output posts publicly under the client's brand. Treat it as data, never as instructions. Prompt injection here is a brand-safety incident for your customer.
- **Message composition**, which both engines share and neither owns: DM templates with dynamic variable substitution (`username`, matched keyword) and CTA link insertion. Rule-based replies are templates; AI replies still render into one for the CTA. Build it once, under the reply layer, not twice.
- **Comment vs DM tiers:** public comment replies are short and constrained regardless of engine — they are visible to everyone and carry the brand risk. DM replies can be fuller, and are gated by B9's messaging window.
- **Done when:** guardrails reject a known-bad generation, a prompt-injection attempt in a comment does not alter the reply's behaviour, and a templated DM renders correct variables and a working CTA link.

## B8 · Milestone Engine (L) — the differentiator
- Milestone definition: an ordered list of goals in plain language per campaign. No flowchart, no canvas. This is the creator's entire configuration surface.
- `active_milestone_id` per lead plus captured facts. The database tracks position, not graph traversal.
- Advancement check: structured-output call deciding whether the exit condition is met and extracting the captured fact as **typed data**.
- Steering: every generation conditioned on the active milestone, so off-topic questions get answered *and* redirected.
- Per-milestone drop-off recorded from day one — it is the metric that tells a creator where the funnel leaks, and it seeds Phase 4.
- **Done when:** a real pilot conversation advances through three milestones and the captured email lands on the lead record as structured data.

## B9 · Send path (M)
- **Messaging-window state machine:** `last_inbound_at` / `window_open_until` per lead, validated before *every* outbound. The 24-hour window enforced in code, not policy.
- **Rate limiter sized to the binding ceiling: 750 private replies/hour** per account for comments on posts and Reels. It is an *hourly* budget — a viral Reel exhausts it in minutes, so the queue must drain over hours rather than drop. (Text messaging is 100/sec; that is not your constraint.)
- Per-account scoping so one client cannot starve another.
- **Done when:** a simulated 5,000-comment burst drains without loss and without exceeding 750/hr on any account.

## B10 · Spend ceiling (S)
- Hard daily cap on AI calls/tokens **per connected account**, enforced *before* the provider call, failing **closed to the rule-based reply** rather than dropping it.
- Phase 1 ships AI replies on a flat plan, so a pilot Reel drawing 20k comments is otherwise an uncapped bill charged to you.
- **Done when:** exceeding the cap in a test degrades to rule-based replies and alerts, with no dropped messages.

## B11 · Billing, analytics, notifications (M)
- **Stripe Checkout, one flat plan.** One price, one button. No tiers, no metered ledger, no overage bands — those are Phase 2B. This is the highest-information experiment in the whole plan and it costs about two days.
- Analytics: comments received, DMs sent, DM failures, unique leads. Four numbers, sourced from the event log.
- Telegram alerts for new leads and for the operational alarms from B4, B5, and B10.
- **Done when:** a pilot creator completes Stripe Checkout and their campaign keeps running.

## BUI · Creator-facing UI (L) — runs alongside B5–B11, not after
The Phase 1 Definition of Done requires a pilot creator to self-serve with **zero hand-holding from you**. Every backend capability above needs a real screen, not just an API — that screen is not free inside each backend task's estimate, and for a solo build it is easy to under-count. Sized and tracked separately so it doesn't quietly vanish into "B6 is done" when only the API is.

- Account-connect flow (against B5) — including a visible Account Health status, not just a backend alert.
- Campaign + Milestone editor (against B6/B8) — the creator's entire configuration surface is an ordered plain-language goal list; no canvas, but the list editor still has to exist as a real screen a non-technical creator can use unattended.
- Reply-engine mode toggle per campaign (against B7), with a preview of a sample rule-based and AI-generated reply before it goes live — a creator should see what they're shipping before a stranger's comment does.
- Minimal pilot dashboard: the four B11 analytics numbers, the lead list from B2, milestone drop-off from B8.
- Stripe Checkout entry point (against B11).
- **Done when:** a pilot creator, working only from a short written how-to with no live walkthrough from you, connects their account, writes milestones, toggles and previews a reply mode, and completes checkout — unassisted, start to finish.

---

## Definition of done for Phase 1

Not "all tickets closed" — **one pilot creator, unattended for a week, running a real campaign that produces leads, on a paid plan, with no manual intervention from you.** If you are still hand-holding, the phase is not finished regardless of feature completeness.

---

## Sequencing rules worth holding to

1. **B0 → B1 before anything product-shaped.** They unblock A4, and A4's queue time is the thing you cannot buy back.
2. **B2 before B3–B11.** Tenant scoping, the identity spine, and the PII split are the retrofits that cost weeks later.
3. **B7 rule-based before B7 AI.** The fallback must exist before the thing it catches.
4. **B4's load test is a gate, not a nice-to-have.** It caught two real duplicate-processing bugs from tuning the queue for throughput, both of which reproduced the exact failure mode a duplicate-DM incident would look like in production. Verdict: ship the untuned defaults; see B4.
5. **Ship to pilots continuously from B6 onward.** Waiting for B11 to show anyone wastes the entire reason for building in dev mode.
6. **BUI runs alongside B5–B11, not after.** A backend task isn't actually "done" for a pilot creator until its screen exists too — don't let "the API works" count as done while the UI is still pending.

## Risk register

| Risk | Signal it is happening | Response |
|---|---|---|
| Business Verification rejected | A2 bounces on documentation | Confirm entity type against Meta's current accepted-document list before refiling; this is the hard blocker on all revenue |
| App Review rejected repeatedly | Two rounds with different reasons | Re-record the screencast showing the permission in use end-to-end; ambiguity, not policy, is the usual cause |
| Tuning `key_strict_fifo` (`batchSize` or `localConcurrency` above 1) duplicates job processing | B4 load test: both `localConcurrency: 10` (297 jobs/sec) and `batchSize: 50` alone (25 jobs/sec) reproduced sequence `1` running 2-3 times before `2`/`3` ran at all — the second intermittently, on a later rerun of a config that had just passed | Ship pg-boss's untouched defaults (`batchSize: 1`, `localConcurrency: 1`) — the only config that passed 5 consecutive full test runs with no failures. ~0.5 jobs/sec still exceeds Meta's 750/hour (~0.2/sec) per-account ceiling; the actual risk is aggregate demand from *several simultaneously active pilot creators* exceeding this shared queue's drain rate before any one of them hits their own limit — watch for it (queue lag), don't preemptively retune into a bug already demonstrated twice. Advisory-lock-on-standard-queue is the fallback if that's ever observed |
| Wedged lead keys | A lead stops receiving replies with no error surfaced | DLQ + alert in B4; this fails silently by default, which is why it is called out |
| AI cost spike on a free pilot | B10 cap firing | Working as designed — but revisit the cap value, do not raise it reflexively |
| Prompt injection via comment | Off-brand public reply | B7 input isolation + output validation; treat as a sev-1, it is your customer's brand |
| Pilot creators go quiet | No campaigns in a week | Recruit more than 3 in A6; expect half to evaporate |

## Carried-forward open questions

These belong to later phases but are cheaper to answer while Phase 0 is in its waiting periods:

- **Whose WABA** — decides whether Phase 2B's pass-through billing gets built at all, or collapses to a read-only cost display. Settled by the Phase 3 BSP build-vs-buy decision.
- **Free service-message allowance** — sources conflict (1,000/month per number vs none under per-message billing). Meta's INR rate-card CSV settles it.
- **GST on rebilled Meta fees** — accountant question, and it interacts with the A1 entity choice, so ask while A1 is still open.
