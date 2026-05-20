#!/usr/bin/env bash
# Set admin password using a hash generated on the Worker (guaranteed to verify).
# Usage: ./scripts/set-admin-password.sh 'YourPasswordHere'
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${1:-}" ]; then
  echo "Usage: ./scripts/set-admin-password.sh 'YourPasswordHere'" >&2
  exit 1
fi

API="${SKILUXE_API:-https://skiluxe-api.gudauri-skiluxe-api.workers.dev}"
PW="$1"

echo "Fetching Worker-generated hash from ${API}..."
RESP=$(curl -sS "${API}/health/bootstrap-hash?pw=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$PW")")
B64=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['b64'], end='')")
OK=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('roundTrip'))")

if [ "$OK" != "True" ] && [ "$OK" != "true" ] && [ "$OK" != "1" ]; then
  echo "Worker round-trip verify failed: $RESP" >&2
  exit 1
fi

echo "Uploading hash (${#B64} chars) to Cloudflare..."
printf '%s' "$B64" | (cd worker && npx wrangler secret put ADMIN_PASSWORD_HASH)
echo "Done. Sign in at https://www.new-gudauri.com/admin/"
