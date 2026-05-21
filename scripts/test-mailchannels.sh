#!/usr/bin/env bash
# Test MailChannels send from your machine (same API as the Worker).
# Usage: MAILCHANNELS_API_KEY=mc-xxx ./scripts/test-mailchannels.sh you@email.com
set -euo pipefail
TO="${1:-}"
KEY="${MAILCHANNELS_API_KEY:-}"
if [ -z "$TO" ] || [ -z "$KEY" ]; then
  echo "Usage: MAILCHANNELS_API_KEY=your-key ./scripts/test-mailchannels.sh recipient@email.com" >&2
  exit 1
fi
BODY=$(cat <<EOF
{
  "personalizations": [{"to": [{"email": "$TO"}]}],
  "from": {"email": "noreply@new-gudauri.com", "name": "SkiLuxe Test"},
  "subject": "SkiLuxe MailChannels test",
  "content": [{"type": "text/plain", "value": "If you see this, MailChannels works."}]
}
EOF
)
echo "Sending test (no DKIM)..."
curl -sS -w "\nHTTP:%{http_code}\n" -X POST "https://api.mailchannels.net/tx/v1/send" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $KEY" \
  -d "$BODY"
