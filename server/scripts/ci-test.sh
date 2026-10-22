#!/usr/bin/env bash
set -euo pipefail

# RenderUtils VM CI supplies DATABASE_URL for this job. Do not create a
# shared database, embed credentials, or print the connection string here.
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL must be supplied by the CI job" >&2
  exit 1
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."
npm ci
npm run typecheck
npm run build
npm run migrate:up
npm test -- --run --no-file-parallelism
