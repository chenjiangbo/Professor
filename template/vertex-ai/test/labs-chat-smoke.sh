#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

PAYLOAD='{
  "messages": [
    { "id": "u1", "role": "user", "parts": [{ "type": "text", "text": "Explain in 3 points the difference between systematic learning and fragmented learning." }] }
  ]
}'

echo "[labs-chat-smoke] POST ${BASE_URL}/api/labs/ai-chat"
curl -sS -N \
  -H "Content-Type: application/json" \
  -X POST "${BASE_URL}/api/labs/ai-chat" \
  -d "${PAYLOAD}" | head -c 1200

echo
echo "[labs-chat-smoke] done"
