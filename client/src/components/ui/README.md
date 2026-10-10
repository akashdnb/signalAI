# SignalAI UI foundation

These primitives are the preferred starting point for **new UI** and when an existing screen is intentionally refreshed. They reuse the app's existing CSS variables and Tailwind color bridge in `src/index.css`; they do not introduce another palette or theme mechanism.

## Components

- `Button`: primary, secondary, ghost, and danger actions; small, medium, and large sizes; optional leading/trailing icons.
- `Field`, `TextInput`, `SelectInput`, `TextareaInput`: labelled form layout and controls with shared dimensions, focus state, and hint/error text. `Field` associates hint/error content with the wrapped control via `aria-describedby` and exposes `aria-invalid` during validation errors.
- `StatusBadge`: consistent neutral, success, warning, danger, information, and accent status tones.
- `PageHeader`: responsive page title, description and action placement.
- `Section`: section heading, supporting description, action slot, and optional divider-based grouping.
- `EmptyState`: reusable icon/title/description/action composition.
- `LoadingState`: accessible async loading presentation.
- `ErrorState`: accessible recoverable error presentation.
- `Skeleton`: lightweight progressive loading placeholder.
- Barrel exports live in `index.ts`.

## Conventions

1. Prefer whitespace and dividers over nesting cards. Use a bordered surface only when it adds meaningful grouping.
2. Use purple for primary actions and meaningful selected states. Use neutral/ghost styling for secondary actions.
3. Use status tones semantically; do not use color as the only indicator of state.
4. Keep page titles near 28–32px, section titles near 16–18px, body text 14–16px, and metadata at 12–13px.
5. Use the shared CSS variables for custom CSS. For Tailwind utilities, use the mapped colors such as `bg-canvas`, `bg-card`, `text-ink`, `text-subtle`, `border-line`, `bg-accent`, `bg-ok`, and `bg-err`.
6. The current app deliberately supports both legacy CSS and Tailwind while screens are migrated. Do not import Tailwind Preflight or remove legacy selectors as part of an individual page change; migrate screen-by-screen and verify both light and dark themes.
7. Existing `.btn-primary`, `.btn-secondary`, `.card`, `.pill`, and form selectors remain supported for backward compatibility. Avoid mixing those classes with the new primitive's classes on the same element.
8. Scope responsive overflow to the component that owns scrolling; avoid global table minimum widths and avoid enlarging inline links merely to satisfy touch-target guidance.

## Example

```tsx
import { Button, EmptyState, PageHeader, Section, StatusBadge } from "../components/ui";

<PageHeader
  title="Leads"
  description="Manage and qualify the people SignalAI discovers in your conversations."
  actions={<Button onClick={openCreate}>Add lead</Button>}
/>

<Section title="Recent activity" description="Latest updates from connected Instagram accounts.">
  {leads.length === 0 ? (
    <EmptyState
      title="No leads yet"
      description="Leads captured through your Instagram conversations will appear here."
      action={<Button onClick={openAutomation}>Create a journey</Button>}
    />
  ) : (
    <StatusBadge tone="success" dot>Connected</StatusBadge>
  )}
</Section>
```
