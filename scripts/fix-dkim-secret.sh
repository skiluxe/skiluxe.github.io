#!/usr/bin/env bash
# Upload MailChannels-compatible DKIM private key (RSA DER base64, not PKCS8).
set -euo pipefail
cd "$(dirname "$0")/../worker"
if [ ! -f dkim.key ]; then
  echo "Missing worker/dkim.key — generate with openssl first." >&2
  exit 1
fi
B64=$(openssl pkey -in dkim.key -outform der | openssl base64 -A)
echo "Updating MAIL_DKIM_PRIVATE_KEY (${#B64} chars)..."
printf '%s' "$B64" | npx wrangler secret put MAIL_DKIM_PRIVATE_KEY
echo "Done. Redeploy: cd worker && npx wrangler deploy"
