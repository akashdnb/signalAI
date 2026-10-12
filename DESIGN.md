# SignalAI UI direction

This document captures the product direction already implied by SignalAI's brand tokens and UI foundation. It is a practical operating interface, not a generic AI landing page. Keep it current when the product's visual direction intentionally changes.

## Direction

**Swiss-functional, product-first, and operational.**

SignalAI helps people manage Instagram conversations, qualify leads, and configure automations. The interface should feel like a dependable tool that makes real work legible: clear hierarchy, precise language, strong status cues, and useful data density. Its personality comes from the product's workflows and details, not decorative effects.

The existing application is light-first with a supported dark theme. Preserve both modes and the user's theme preference.

## Brand and tokens

Use the current tokens in `client/src/index.css` and the source brand guide at `docs/signalai-brand-assets/BRAND-GUIDE.txt` when available. Do not create a parallel palette.

Current core values documented in the CSS:

- Primary action/accent: `#7C3AED`
- Blue supporting accent: `#2563EB`
- Cyan accent: `#0E7490` in the light theme; the dark theme has a separate contrast-aware value
- Light canvas: `#F1F5F9`
- Surface: `#FFFFFF`
- Main text: `#0F172A`
- Muted text: `#596273`
- Borders: `#E2E8F0`
- Existing body font stack begins with `Plus Jakarta Sans`

Treat these as existing implementation facts, not permission to use every brand color in every component. Purple is mainly for primary actions and meaningful selection. Blue/cyan should be supporting accents with a reason. Status color must reflect status and must not be the only signal.

Do not add a new font, palette, token namespace, or UI framework for a page refresh. If a brand change is intentional, change the shared system deliberately rather than quietly overriding tokens per screen.

## Layout and surfaces

- Let the task determine the layout. Workflow builders need a legible canvas and explicit controls; inboxes need scan-friendly conversation lists; lead views need accurate data and useful filters; settings need clear labels and grouping.
- Prefer whitespace, alignment, tables, and dividers over wrapping every item in a card.
- Use bordered surfaces only when they express a meaningful group or interaction boundary.
- Reserve elevation for overlays or places that need clear layering. Avoid piles of equally elevated cards.
- Use radius as a semantic choice. Follow existing component conventions; do not round every container maximally or introduce unrelated radius values.
- For data-heavy screens, optimise for scanning, status comparison, and the next action before visual spectacle.
- Use the real product UI, relevant icons, meaningful diagrams, or grounded illustrations when an asset helps. Do not fill empty space with abstract AI artwork or stock imagery unrelated to the task.

## Type and copy

- Follow the existing typography and hierarchy in the UI foundation. Use size, weight, line length, and spacing to establish levels; do not make everything a large headline or a dense wall of text.
- Name the actual object and action: "Connect Instagram account", "Save journey", "Retry sync", or "No conversations match these filters".
- Prefer concrete verbs and product-specific language. Remove phrases that merely sound polished, including generic "AI-powered" claims, "seamlessly", "unlock", "revolutionize", and unsupported promises.
- Do not invent testimonials, customer names, activity counts, outcomes, speed claims, or analytics. If data is illustrative, label it as sample data.
- Avoid repeated slogan structures and overuse of em dashes. Use natural, direct sentences.
- Empty and error copy should explain what is happening and give the user a useful next step.

## Interaction and motion

- Every interactive element needs an observable purpose and a clear state.
- Primary actions should be visually distinct; secondary actions should remain quieter. Destructive actions need appropriate wording and confirmation when consequences warrant it.
- Use concise, contextual feedback instead of generic spinners or unexplained status changes.
- Motion should explain a state change, spatial relationship, or direct manipulation. Do not add scroll-triggered fade-ups or decorative animation by default.
- Respect `prefers-reduced-motion`. Maintain keyboard interaction, visible focus, and clear disabled/loading states.
- In automation and journey-building flows, never let visual polish obscure connection paths, validation, unsaved changes, publish status, or the distinction between saving a draft and activating it.

## State completeness

For each feature, implement the states relevant to its actual lifecycle rather than styling only the happy path:

- Initial/first-use empty state, with a relevant next action
- Loading state whose shape/context fits the content
- No-results state for searches or filters, distinct from first-use empty
- Recoverable error state that explains the problem and provides a next step
- Success/updated state, including clear feedback for consequential actions
- Relevant edge states such as long labels, partial data, disconnected accounts, invalid input, denied permissions, and narrow screens

Use the shared UI primitives whenever possible:

- `Button`, `Field`, `TextInput`, `SelectInput`, `TextareaInput`
- `StatusBadge`, `PageHeader`, `Section`
- `EmptyState`, `LoadingState`, `ErrorState`, `Skeleton`

See [the UI foundation README](./client/src/components/ui/README.md). Do not build a second implementation of a primitive without a concrete gap in the existing one.

## Deliberate anti-defaults

These are warnings, not absolute bans. Use a pattern only when it serves this screen and the established brand:

- Decorative purple/blue gradients, glassmorphism, neon glows, and ornamental blobs
- Identical rounded cards for every piece of content
- A centered headline/subtitle/two-button composition for unrelated pages
- Three equal feature cards with parallel slogans
- Emoji used as the primary icon system
- Fake "live" dashboards, fabricated trust badges, placeholder customer logos, and invented testimonials
- Shadow-plus-scale hover effects and generic entrance animations
- Generic labels such as "Submit", "Click here", "Learn more", or "Something went wrong"

A useful screen can still be visually distinctive without being loud. Distinction should come from information hierarchy, the workflow model, realistic content, carefully used brand accents, and purposeful interaction details.

## Design-change self-audit

Before shipping new or refreshed UI, answer:

1. What is specific to this screen and to SignalAI?
2. What is the visual hierarchy, and which action should the user notice first?
3. Which decorative/default patterns were deliberately avoided, and why?
4. Are the underlying values and claims real, clearly sample-labelled, or absent?
5. What happens in loading, first-use empty, no-results, error, success, and relevant edge states?
6. Does it work with keyboard, visible focus, reduced motion, both themes, and narrow viewports?
7. Did this change reuse the existing tokens/primitives and avoid unrelated regressions?


## Reference projects

The anti-slop approach here is adapted to SignalAI rather than copied as a third-party package:

- [Krirox/anti-ai-slop-skills](https://github.com/Krirox/anti-ai-slop-skills) — pre-flight review, specificity, hierarchy, and deliberate art direction.
- [miqdadbadjuber/anti-slop](https://github.com/miqdadbadjuber/anti-slop) — separate filtering from visual direction, honest copy/data, state coverage, accessibility, and a delivery gate.
- [huyhoangnhh98/anti-ai-design](https://github.com/huyhoangnhh98/anti-ai-design) — consistent direction across screens, reusable tokens, purposeful motion, responsive constraints, and a design self-audit.

SignalAI-specific rules in this document take precedence whenever an upstream pattern conflicts with the existing product, real workflows, established tokens, or accessibility.


## Source record and redesign plan

The three upstream projects that informed these guardrails are documented with links, specific adopted principles, and reuse/license notes in [`docs/ANTI_AI_DESIGN_SOURCES.md`](./docs/ANTI_AI_DESIGN_SOURCES.md). The product-specific route-by-route redesign plan is [`docs/FLAGSHIP_REDESIGN_PLAN.md`](./docs/FLAGSHIP_REDESIGN_PLAN.md). Those documents distinguish source-derived methods from SignalAI-specific findings and priorities.
