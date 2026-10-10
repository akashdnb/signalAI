# SignalAI UI design foundation

This foundation defines the shared visual rules for the gradual UI polish. It is additive: existing screens and behavior remain unchanged while components are migrated intentionally.

## Design principles

- **One product, one language.** Reuse shared color tokens and primitives instead of inventing local button, field, card or status styles.
- **Hierarchy before containers.** Use typography, spacing and dividers to group settings; add cards only when a distinct surface improves comprehension.
- **One primary action.** Use the accent color for the main action or important selected state; keep secondary actions neutral.
- **Understandable states.** Status text remains visible alongside color and, where helpful, a dot/icon.
- **Accessible defaults.** Preserve keyboard focus rings, meaningful labels, field hints/errors, and reduced-motion behavior.
- **Preserve functionality.** This phase establishes foundations only; no product workflows, API behavior, routes or automation semantics change.

## Tokens

The source of truth remains the CSS variables in `client/src/index.css`, including current light/dark theme behavior. Shared components use the existing Tailwind token bridge rather than maintaining a second color table.

| Concern | Convention |
| --- | --- |
| Page title | 28–32px, bold, tight tracking |
| Section title | 16–18px, semibold |
| Body copy | 14–16px |
| Helper / metadata | 12–13px |
| Control height | 40px desktop; 44px minimum on mobile where touch sizing applies |
| Radius | 8px for controls, 12–16px for grouped surfaces, pill for status |
| Border | 1px neutral border; avoid multiple nested borders |
| Elevation | Reserve shadows for floating/raised contexts, not every card |
| Primary | SignalAI purple (#7C3AED) |
| Secondary | Neutral surface or ghost treatment |
| Success | Existing semantic green tokens |
| Error / destructive | Existing semantic red tokens |
| Dark mode | Respect the existing stored override and operating-system preference |

## Component inventory

Canonical implementations live in `client/src/components/ui`. Use the barrel export from `client/src/components/ui` for new screens.

- Button
- Field / TextInput / SelectInput / TextareaInput
- StatusBadge
- PageHeader
- Section
- EmptyState

Do not introduce a separate token system in component files. If a token is missing, add it at the CSS variable/theme-bridge layer and check both light and dark themes.

## Rollout sequence

1. Foundation primitives and documented usage.
2. AppShell and representative Automation, Builder and Inbox screens.
3. Remaining product screens and their loading, empty, error and responsive states.
4. Contrast, keyboard, screen-reader and reduced-motion review.

## Out of scope for this phase

- Rewriting routes, server/API behavior, or journey persistence.
- Replacing the current app shell.
- Wholesale page rewrites or changing workflow semantics.
- Removing compatibility CSS before existing pages have migrated.
