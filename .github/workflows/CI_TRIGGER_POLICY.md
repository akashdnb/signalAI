# CI Trigger Policy

SignalAI server/database validation is authoritative through the RenderUtils VM CI interface (`ci_run`, `ci_status`, `ci_logs`, `ci_cancel`, `ci_list`).

## Server CI policy

- Use the persistent VM's PostgreSQL installation; do not add a Docker/Postgres service to repository CI.
- The VM CI layer creates an isolated temporary database for each CI job and supplies SignalAI's existing `DATABASE_URL` contract to that job.
- The VM CI layer owns database cleanup and must drop the temporary database even when the job fails.
- Project commands must consume `DATABASE_URL` as-is; they must not create a shared CI database, invent a second test-database variable, embed credentials, or print connection strings.
- Run `bash server/scripts/ci-test.sh` from the repository root for the standard server validation sequence.
- Forge CI is not used for SignalAI validation.

## GitHub Actions

GitHub Actions is intentionally not used as the authoritative server/database test runner. Keep CI-specific changes aligned with the VM CI contract above rather than reintroducing service containers or hardcoded database credentials.

## Why

The repository uses agent-driven development and intentionally avoids paying the compute cost of running the full server suite for every intermediate commit. Validation should happen at deliberate checkpoints through the authoritative VM CI path.
