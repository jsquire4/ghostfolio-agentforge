#!/usr/bin/env bash
# Smoke-test: chatbox → agent round-trip
# Usage: ./scripts/test-chat.sh [message] [conversationId]

set -e

AGENT_URL="${AGENT_URL:-http://localhost:8000}"
MESSAGE="${1:-What is my portfolio performance?}"
CONVERSATION_ID="${2:-test-user-123}"

echo "→ POST $AGENT_URL/api/v1/chat"
echo "  message       : $MESSAGE"
echo "  conversationId: $CONVERSATION_ID"
echo ""

RESPONSE=$(curl -sf \
  -X POST "$AGENT_URL/api/v1/chat" \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"$MESSAGE\", \"conversationId\": \"$CONVERSATION_ID\"}")

echo "← Response:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"

# Basic assertions
if echo "$RESPONSE" | grep -q '"message"'; then
  echo ""
  echo "✓ 'message' field present"
else
  echo "✗ missing 'message' field" && exit 1
fi

if echo "$RESPONSE" | grep -q '"conversationId"'; then
  echo "✓ 'conversationId' field present"
else
  echo "✗ missing 'conversationId' field" && exit 1
fi

echo ""
echo "Round-trip OK"
