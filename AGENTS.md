# SignalAI agent instructions

These instructions apply to the whole repository. They are the project's working rules, not a request to redesign the product on every change.

## Before changing the UI

For work that creates, materially changes, or reviews frontend UI:

1. Read [`DESIGN.md`](./DESIGN.md) for SignalAI's visual direction and existing brand tokens.
2. Read [`client/src/components/ui/README.md`](./client/src/components/ui/README.md) for the shared UI primitives and migration constraints.
3. Inspect the existing screen, its nearby components, and existing loading/empty/error/success states before writing code.
4. For a substantial new screen or redesign, state the intended visual direction and the specific generic patterns you will avoid before implementation. Do not add this ceremony for a narrow bug fix or a one-line adjustment.

The principles here are an intentional synthesis of anti-slop practices, adapted to SignalAI's existing brand and codebase. Do not copy an upstream skill wholesale or install a second design system that conflicts with the one in the repository.

## Product principles

- **Specific beats generic.** Design for the real job: operating Instagram conversations, qualifying leads, and configuring automations. Use the actual entities, actions, statuses, constraints, and terminology of the screen.
- **Hierarchy beats decoration.** Make the next useful action obvious. Use clear page/section headings, readable data density, and whitespace or dividers before adding another card.
- **Purpose beats trend.** Every color, border, icon, illustration, animation, and surface treatment must help users understand status, relationships, or actions. Do not add effects only to make a screen look more elaborate.
- **Consistency with character.** Build a recognisable SignalAI interface from the established tokens and components. Avoid both generic template output and novelty that harms usability.
- **Truth beats marketing.** Never invent users, testimonials, customer logos, performance claims, live activity, analytics, or success counts. Sample data must be clearly identified as sample data and confined to appropriate demo/test contexts.
- **Usability beats a visual trick.** Aesthetic choices must not obscure navigation, labels, data relationships, automation paths, save state, permission boundaries, or destructive actions.

## Anti-slop review before shipping frontend work

Check the change against these points and fix any relevant failures:

- The layout has a clear visual hierarchy; not every element competes for attention.
- The screen has a product-specific reason to exist in its current structure. Do not default to a centered hero, identical three-card feature grids, decorative stat cards, or a generic SaaS section sequence without a reason.
- The interface reuses existing design tokens and UI primitives. No accidental second palette, ad-hoc design system, or one-off styling convention.
- Purple is used for primary actions or meaningful selected states, not as a blanket decoration. Status colors retain semantic meaning.
- No new decorative purple/blue gradient, glass effect, neon accent, arbitrary oversized rounding, emoji iconography, or ornamental motion unless there is a concrete, approved product reason. Existing branded treatments are not an invitation to add more.
- Copy names the action, object, outcome, and relevant constraint. Avoid empty hype, generic AI claims, placeholder prose, unexplained jargon, and repetitive slogan-like triplets.
- Buttons describe their action (for example, "Save journey" or "Reconnect account"), not "Submit", "Click here", or "Learn more" when a more specific label is possible.
- Every relevant async flow handles loading, empty/first-use, no-results, recoverable error, and success. Cover meaningful edge cases such as long names, partial data, disconnected accounts, validation failures, and permission restrictions.
- Keyboard use, visible focus, appropriate labels, contrast, screen-reader status, and reduced-motion preferences remain functional.
- Layouts work at supported desktop and mobile widths without accidental overflow, tiny touch targets, clipped controls, or content hidden behind overlays.
- Motion has a purpose and does not slow down routine work. Avoid blanket `transition-all`, repetitive entrance animations, and motion that ignores reduced-motion preferences.
- The implementation matches the existing architecture. Do not add a dependency, rewrite a whole screen, change working behavior, or introduce broad CSS selectors to make a small visual change.

## SignalAI implementation constraints

- The frontend currently bridges legacy CSS variables/selectors and Tailwind utilities. Preserve that compatibility while migrating screen by screen.
- Do not import Tailwind Preflight or remove existing legacy selectors as part of a page-level change.
- Prefer components exported from `client/src/components/ui/` for new or intentionally refreshed screens. Read that directory's README and inspect the component API before adding a parallel primitive.
- Use the shared CSS variables documented in `client/src/index.css`. Do not hard-code a new global theme when an existing token fits.
- Keep page-specific rules scoped to the page/component that owns them. Avoid broad selectors that silently restyle unrelated screens.
- Preserve existing API semantics, data truth, permissions, and workflows while improving presentation. Do not replace real data with fake demonstration values to make the interface look populated.
- Do not remove an information-architecture item or user-visible capability simply because it is not yet implemented; follow the established disabled/coming-soon pattern unless asked otherwise.

## Delivery gate

Before declaring a frontend change complete, report a short pass/fail summary covering:

1. **Direction:** the product-specific choice made, or why no visual direction change was needed.
2. **Slop removed/avoided:** the most relevant generic pattern(s) avoided or corrected.
3. **States and accessibility:** relevant states, keyboard/focus, and responsive behavior checked.
4. **Verification:** tests/build/lint run and any checks not run.

Be accurate about verification. Never claim a check passed unless it was actually run.
