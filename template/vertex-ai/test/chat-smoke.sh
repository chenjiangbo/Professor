#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
NOTEBOOK_ID="${NOTEBOOK_ID:-}"

if [[ -n "${NOTEBOOK_ID}" ]]; then
  PAYLOAD="$(cat <<JSON
{
  "notebookId": "${NOTEBOOK_ID}",
  "messages": [
    { "id": "u1", "role": "user", "parts": [{ "type": "text", "text": "请总结当前资料的核心观点，并给出1个可执行建议。" }] }
  ]
}
JSON
)"
else
  PAYLOAD='{
    "messages": [
      { "id": "u1", "role": "user", "parts": [{ "type": "text", "text": "请解释什么是第一性原理，并举一个商业场景例子。" }] }
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
