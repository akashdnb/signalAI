## Summary

<!-- What changed and why? -->

## Verification

- [ ] Tests/build/lint run where relevant (list commands and outcomes below).
- [ ] Existing workflows, API behavior, and real data semantics are preserved.
- [ ] Any checks not run are called out explicitly.

## UI quality gate (complete when frontend behavior or presentation changes)

- [ ] The change fits SignalAI's direction in `DESIGN.md`; the screen is specific to the actual workflow.
- [ ] Existing tokens and UI primitives are reused; no parallel palette or styling system was introduced.
- [ ] Hierarchy is clear and decoration has a purpose; no generic cards, gradients, slogans, fake metrics, or ornamental motion were added without reason.
- [ ] Copy is concrete and honest; labels explain the action, and no unsupported claims or placeholder content are presented as real.
- [ ] Relevant loading, first-use empty, no-results, error, success, and edge states are handled.
- [ ] Keyboard/focus, labels, status semantics, reduced motion, both themes, and responsive layouts were checked as applicable.
- [ ] The change is scoped and does not silently restyle unrelated screens.
