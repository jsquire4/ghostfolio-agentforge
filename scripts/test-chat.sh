#!/usr/bin/env bash
# Smoke-test: chatbox → agent round-trip
# Usage: ./scripts/test-chat.sh [message] [conversationId]
#
# Requires: JWT_SECRET_KEY in .env (or EVAL_JWT env var override)

set -e

AGENT_URL="${AGENT_URL:-http://localhost:8000}"
MESSAGE="${1:-What is my portfolio performance?}"
CONVERSATION_ID="${2:-test-user-123}"

# Generate JWT for auth
if [ -n "${EVAL_JWT:-}" ]; then
  JWT="$EVAL_JWT"
elif [ -f .env ]; then
  JWT_SECRET=$(grep '^JWT_SECRET_KEY=' .env | cut -d'=' -f2-)
  if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "<INSERT_RANDOM_STRING>" ]; then
    echo "✗ JWT_SECRET_KEY not configured in .env" && exit 1
  fi
  # Generate a simple JWT using node
  JWT=$(node -e "
    const jwt = require('jsonwebtoken');
    console.log(jwt.sign({ id: 'test-user', iat: Math.floor(Date.now()/1000) }, '$JWT_SECRET'));
  ")
else
  echo "✗ No .env file found and EVAL_JWT not set" && exit 1
fi

echo "→ POST $AGENT_URL/api/v1/chat"
echo "  message       : $MESSAGE"
echo "  conversationId: $CONVERSATION_ID"
echo "  auth          : Bearer ${JWT:0:20}..."
echo ""

RESPONSE=$(curl -sf \
  -X POST "$AGENT_URL/api/v1/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
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
