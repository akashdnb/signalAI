# Anti-AI design references used by SignalAI

This document records the upstream sources behind SignalAI's anti-slop engineering and redesign guidance. The links below are the canonical project repositories; consult their current contents when reviewing or evolving the guidance.

## 1. Anti-AI Slop Skills

**Source:** [Krirox/anti-ai-slop-skills](https://github.com/Krirox/anti-ai-slop-skills)

**What we take from it**
- Catch default-looking UI before implementation rather than only polishing it after the fact.
- Evaluate hierarchy, specificity, restraint, visual direction, copy, and real product states.
- Do not default to the same centered hero, three-card grids, generic SaaS page sequence, decorative gradients, or stock visuals.
- Require a final pass for loading, empty, error, success, and meaningful edge cases.

**How SignalAI adapts it:** use its checklist as a quality filter, not as a command to choose an extreme aesthetic. SignalAI is an operational SaaS product: workflow clarity, scanability, trust, and accurate state representation come before visual theatrics.

**Reuse note:** this repository's README does not advertise a license. We reference its concepts and link to the source; we do not copy its skill text or package into SignalAI.

## 2. Anti-Slop

**Source:** [miqdadbadjuber/anti-slop](https://github.com/miqdadbadjuber/anti-slop)

**What we take from it**
- Separate the filter that removes generic or dishonest output from the design direction that gives a product character.
- Avoid invented customer proof, fake metrics, filler copy, unhelpful labels, comments that restate code, and decorative UI without purpose.
- Require practical quality checks for accessibility, keyboard/focus behavior, responsive layout, and relevant UX states.
- Finish with a report that states what was checked and what remains unverified.

**How SignalAI adapts it:** `DESIGN.md` gives product direction while `AGENTS.md` and the pull request checklist filter output. Claims and sample data must be truthful, and delivery notes must not claim checks passed when they were not run.

**License:** the source repository declares the MIT License. This document summarizes ideas and links to the source; it does not vendor upstream code.

## 3. Anti-AI Design

**Source:** [huyhoangnhh98/anti-ai-design](https://github.com/huyhoangnhh98/anti-ai-design)

**What we take from it**
- Resolve design intent and platform needs before building.
- Keep tokens, layout grammar, and interactions coherent across related screens.
- Use purposeful motion and semantic surface/radius hierarchy rather than applying decoration uniformly.
- Self-audit visual output and cover loading, empty, error, and success states.

**How SignalAI adapts it:** design tokens should be decided centrally for a redesign and then reused across screens. The HTML/CSS/JS bundle format and unrelated platform assumptions of the source tool are not imposed on SignalAI's React + TypeScript application.

**License:** the source repository declares the MIT License. This document summarizes ideas and links to the source; it does not vendor upstream code.

## Combined rule for SignalAI

These are complementary references, not three design systems to install:

- **Filter:** remove generic, misleading, inaccessible, or purposeless output.
- **Direction:** define what makes SignalAI visually and behaviorally recognizable.
- **Verification:** test the real workflow and states, and report evidence honestly.

SignalAI-specific requirements, existing application behavior, accessibility, and real data always take precedence over a generic upstream example. If a future redesign changes the brand palette or typography, make the change deliberately in the shared token system and document why; do not add competing one-off styles screen by screen.

## Related project documents

- [Agent instructions](../AGENTS.md)
- [SignalAI design direction](../DESIGN.md)
- [Flagship redesign plan](./FLAGSHIP_REDESIGN_PLAN.md)
- [UI primitive conventions](../client/src/components/ui/README.md)
