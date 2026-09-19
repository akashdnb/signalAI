#!/usr/bin/env bash
# Starts both the API server (server/) and BUI (client/) for local review.
# First run bootstraps server/.env and client/.env with working local
# defaults (throwaway TOKEN_ENCRYPTION_KEYS/SESSION_SECRET) if they don't
# exist yet — edit server/.env afterward to add real META_APP_SECRET,
# INSTAGRAM_*, STRIPE_*, or TELEGRAM_* values when you need those paths.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT_DIR/server"
CLIENT_DIR="$ROOT_DIR/client"

if [ ! -f "$SERVER_DIR/.env" ]; then
  echo "No server/.env found — creating one with throwaway local-dev secrets."
  TOKEN_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  SESSION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  cat > "$SERVER_DIR/.env" <<EOF
PORT=3000
NODE_ENV=development
DATABASE_URL=postgres://localhost:5432/signalai_dev
TOKEN_ENCRYPTION_KEYS=v1:$TOKEN_KEY
SESSION_SECRET=$SESSION_KEY
APP_BASE_URL=http://localhost:5173
WEB_APP_ORIGIN=http://localhost:5173
AI_DAILY_CALL_CAP=300
EOF
  echo "Wrote $SERVER_DIR/.env — see server/env.example for the full list (META_APP_SECRET, INSTAGRAM_*, STRIPE_*, TELEGRAM_*)."
fi

if [ ! -f "$CLIENT_DIR/.env" ]; then
  cp "$CLIENT_DIR/env.example" "$CLIENT_DIR/.env"
fi

# The server reads config straight from process.env (no dotenv loader
# built in) — export server/.env into this shell so the child process
# actually sees it, rather than relying on the app to load the file itself.
set -a
# shellcheck disable=SC1091
source "$SERVER_DIR/.env"
set +a

if [ ! -d "$SERVER_DIR/node_modules" ]; then
  echo "Installing server dependencies..."
  (cd "$SERVER_DIR" && npm install)
fi
if [ ! -d "$CLIENT_DIR/node_modules" ]; then
  echo "Installing client dependencies..."
  (cd "$CLIENT_DIR" && npm install)
fi

SERVER_PID=""
CLIENT_PID=""

cleanup() {
  echo ""
  echo "Stopping dev servers..."
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  [ -n "$CLIENT_PID" ] && kill "$CLIENT_PID" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT INT TERM

echo "Starting API server on http://localhost:3000 ..."
(cd "$SERVER_DIR" && npm run dev) &
SERVER_PID=$!

echo "Starting BUI on http://localhost:5173 ..."
(cd "$CLIENT_DIR" && npm run dev) &
CLIENT_PID=$!

wait
