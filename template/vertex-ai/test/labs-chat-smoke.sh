#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

PAYLOAD='{
  "messages": [
    { "id": "u1", "role": "user", "parts": [{ "type": "text", "text": "请用3点解释系统化学习和碎片化学习的区别。" }] }
  ]
}'

echo "[labs-chat-smoke] POST ${BASE_URL}/api/labs/ai-chat"
curl -sS -N \
  -H "Content-Type: application/json" \
  -X POST "${BASE_URL}/api/labs/ai-chat" \
  -d "${PAYLOAD}" | head -c 1200

echo
echo "[labs-chat-smoke] done"
