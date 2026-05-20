#!/usr/bin/env bash
# Generate ADMIN_PASSWORD_HASH and upload to Cloudflare in one step.
# Usage: ./scripts/set-admin-password.sh 'YourPasswordHere'
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${1:-}" ]; then
  echo "Usage: ./scripts/set-admin-password.sh 'YourPasswordHere'" >&2
  exit 1
fi

HASH=$(node scripts/hash-password.js "$1")
echo "Generated hash (first 40 chars): ${HASH:0:40}..."

cd worker
printf '%s' "$HASH" | npx wrangler secret put ADMIN_PASSWORD_HASH
echo "Done. Sign in at https://www.new-gudauri.com/admin/ with the same password."
