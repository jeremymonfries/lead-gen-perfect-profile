#!/bin/bash
# Start Perfect Profile: Docker -> Supabase -> migrations -> Next.js dev server -> browser.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

APP_TITLE="Perfect Profile Prospecting"

port_in_use() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

# Echo the first free port in 3000, 3001-3010; non-zero exit if none.
find_free_port() {
  local p
  for p in 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010; do
    if ! port_in_use "$p"; then echo "$p"; return 0; fi
  done
  return 1
}

# Echo a port (3000-3010) already serving this app, if any.
find_running_app() {
  local p
  for p in 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010; do
    if port_in_use "$p" && curl -s --max-time 3 "http://localhost:$p/login" 2>/dev/null | grep -q "$APP_TITLE"; then
      echo "$p"; return 0
    fi
  done
  return 1
}

# Allow sourcing for tests without running anything.
if [ "${1:-}" = "--functions-only" ]; then return 0 2>/dev/null || exit 0; fi

echo "== Perfect Profile =="

if [ ! -d node_modules ]; then
  echo "Installing the app's files (first run only, may take a few minutes)..."
  npm install
fi

if ! docker info >/dev/null 2>&1; then
  echo "Starting Docker Desktop..."
  open -a Docker || { echo "Could not open Docker. Please install Docker Desktop and try again."; exit 1; }
  waited=0
  until docker info >/dev/null 2>&1; do
    if [ "$waited" -ge 120 ]; then
      echo "Docker did not start within 2 minutes. Please open Docker Desktop yourself, wait until it says it is running, then run this again."
      exit 1
    fi
    sleep 3; waited=$((waited + 3))
  done
fi
echo "Docker is running."

if ! npx supabase status >/dev/null 2>&1; then
  echo "Starting the database (this can take a minute)..."
  npx supabase start
else
  echo "Database is already running."
fi
echo "Checking for database updates (your data is kept)..."
npx supabase migration up

if running=$(find_running_app); then
  echo "Perfect Profile is already running on port $running. Opening it..."
  open "http://localhost:$running"
  exit 0
fi

PORT=$(find_free_port) || { echo "No free port between 3000 and 3010. Close other apps and try again."; exit 1; }
echo "Starting the app on port $PORT..."

(
  i=0
  while [ "$i" -lt 45 ]; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/login" 2>/dev/null || true)
    if [ "$code" = "200" ]; then open "http://localhost:$PORT"; exit 0; fi
    sleep 2; i=$((i + 1))
  done
  echo "The app is taking a long time to start. Try opening http://localhost:$PORT yourself."
) &

echo "Leave this window open while you use the tool. Press Ctrl+C to stop. (Supabase keeps running in Docker; stop it with: npx supabase stop)"
npm run dev -- -p "$PORT"
