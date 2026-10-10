# Phase 2 — App shell

Phase 2 applies the shared design language to SignalAI's authenticated shell without changing navigation semantics, routes, account behavior, or API calls.

## Included

- Persistent desktop sidebar with a clearer 240px workspace rail.
- Consistent navigation row height, spacing, hover treatment and active-state indicator.
- Existing primary and secondary information architecture preserved.
- Current-plan area visually separated from navigation.
- Desktop account/top bar tightened to the same 60px rhythm as the sidebar header.
- Existing Instagram connection, AI-token usage, theme toggle, notification placeholder and account menu retained.
- Mobile navigation remains a drawer with the existing focus trap and Escape behavior; touch targets are increased to 44px.
- Mobile account sheet and menu remain the same workflows, with the visual system aligned to the shell.
- Reduced-motion users do not receive navigation transitions.

## Deliberate non-goals

- No route changes.
- No API or session behavior changes.
- No replacement of the existing AppShell architecture.
- No page-level redesign yet; Automation, Builder and Inbox are the representative screens for Phase 3/propagation.

## Implementation

`client/src/styles/app-shell-phase2.css` is imported from `client/src/App.tsx`. The styling is scoped to the existing `aria-label="Primary navigation"` landmark and its shell siblings so legacy page CSS remains isolated.
