# 04 — Prospecting & Acquisition System

## Product direction captured from the acquisition planning

The acquisition workflow should be treated as a first-class SignalAI capability domain rather than a collection of scraping scripts or one-off agent prompts.

The source strategy is:

```text
Find company
  -> qualify company
  -> inspect Instagram / website
  -> identify decision maker
  -> find contact details
  -> research buying/problem signals
  -> personalize outreach
  -> start problem conversation
  -> demo / pilot
  -> customer
  -> case study / referral
```

Instagram is a qualification/research signal, not the only source for finding people.

## Initial ICP workflow

The initial prospecting system should support:

- Shopify agencies
- Manychat agency ecosystem
- Clutch
- DesignRush
- The Manifest
- Shopify Partner Directory
- US geography
- approximately 5–50 employee agencies
- agencies serving DTC/e-commerce brands
- agencies with social/marketing services
- active website and LinkedIn presence
- identifiable founder/decision maker

The workflow should remain configurable so the ICP can expand later without changing the underlying data model.

## Prospect schema

Minimum useful normalized fields:

```text
Company
Website
Country
Size
Niche
Founder / decision maker
LinkedIn
Email
Instagram
Shopify
Client examples
SignalAI trigger
Status
```

These should map to stable Company, Person, Contact, Signal and Prospect resources rather than a single flat database record.

## Research capability

`research_company(companyId)` should orchestrate connectors and normalize results into:

- company identity
- website
- social profiles
- technology stack
- people/decision makers
- client examples
- relevant signals
- evidence/source metadata
- confidence
- scoring inputs

A research result should preserve source/evidence provenance so an agent can explain why it made a recommendation.

## Connector candidates

The architecture should make the following replaceable connectors possible:

- Shopify Partner Directory
- Manychat partner ecosystem
- Clutch
- DesignRush
- The Manifest
- website inspection
- LinkedIn research
- Instagram research
- Apollo
- Hunter
- Wappalyzer

Do not couple the Company model to any single provider. Provider IDs belong in connector/source metadata.

## Technology-based prospecting

Technology signals such as Shopify usage can be used as filters or scoring features. A Wappalyzer-like connector can provide technology evidence, while company and social research provide context.

The architecture should support combining these signals without making the scoring algorithm depend on a single provider.

## Prospect scoring

A scoring capability should be explainable. Example dimensions:

- ICP fit
- company size fit
- niche fit
- technology fit
- social/activity signal
- client fit
- identifiable decision maker
- contactability
- evidence of the target problem

The result should include both score and reasons/evidence.

## Outreach workflow

Outreach should be a capability with approval controls, not an automatic side effect of prospect research.

Recommended progression:

```text
research
  -> qualify
  -> score
  -> draft personalized outreach
  -> human review/approval
  -> send
  -> track response
  -> update prospect/conversation
```

This allows future agents to automate more of the workflow while keeping high-impact communication controlled.

## Funnel metrics

Track more than reply rate. The acquisition system should support metrics such as:

- prospects researched
- qualified prospects
- contacts found
- outreach drafted
- outreach sent
- replies
- positive replies
- demos
- pilots
- customers
- conversion by source
- conversion by ICP segment
- conversion by signal

This creates a feedback loop for improving the ICP and scoring model.

## Long-running research

Researching 100 companies should create a Job rather than a single blocking request:

```text
create_prospect_research_job
  -> job_id
  -> discover companies
  -> qualify
  -> enrich
  -> research signals
  -> score
  -> persist prospects
  -> job results / report
```

The same job can be started by the native copilot, a scheduled workflow, or an external MCP client.

## Product implication

This domain is why the architecture must be broader than MCP alone. The future value comes from reusable research, enrichment, scoring and outreach capabilities that multiple interfaces can orchestrate.
