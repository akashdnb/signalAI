# CI Trigger Policy

SignalAI CI is intentionally not run on every push.

## Trigger policy

- CI workflows must use `workflow_dispatch` for normal execution.
- Do not add `push` or `pull_request` triggers to CI workflows unless this policy is explicitly changed.
- An agent may trigger the workflow explicitly after making changes that need validation.
- A developer may trigger the workflow manually from the GitHub Actions UI.

## Why

The repository uses agent-driven development and intentionally avoids paying the compute cost of running the full CI suite for every intermediate commit. Validation should happen at deliberate checkpoints rather than on every push.

## Adding a new workflow

Before adding a new workflow, decide whether it is CI. If it is CI, make it manually/agent triggered. Deployment and release workflows may have their own explicit triggers, but they must not silently turn ordinary pushes into full CI runs.
