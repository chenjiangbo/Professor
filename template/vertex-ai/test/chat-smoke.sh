#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
NOTEBOOK_ID="${NOTEBOOK_ID:-}"

if [[ -n "${NOTEBOOK_ID}" ]]; then
  PAYLOAD="$(cat <<JSON
{
  "notebookId": "${NOTEBOOK_ID}",
  "messages": [
    { "id": "u1", "role": "user", "parts": [{ "type": "text", "text": "Summarize the core points in the current material and provide one actionable suggestion." }] }
  ]
}
JSON
)"
else
  PAYLOAD='{
    "messages": [
      { "id": "u1", "role": "user", "parts": [{ "type": "text", "text": "Explain first-principles thinking and give one business scenario example." }] }
    ]
  }'
fi

echo "[chat-smoke] POST ${BASE_URL}/api/chat"
curl -sS -N \
  -H "Content-Type: application/json" \
  -X POST "${BASE_URL}/api/chat" \
  -d "${PAYLOAD}" | head -c 1200

echo
echo "[chat-smoke] done"
