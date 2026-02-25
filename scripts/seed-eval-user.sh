#!/usr/bin/env bash
# Seeds a Ghostfolio eval user with demo portfolio data.
# Writes GHOSTFOLIO_API_TOKEN to .env so evals can authenticate.
#
# Usage: ./scripts/seed-eval-user.sh
# Requires: Ghostfolio running at localhost:3333, .env file exists

set -euo pipefail

GHOSTFOLIO_URL="${GHOSTFOLIO_BASE_URL:-http://localhost:3333}"
ENV_FILE=".env"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

echo ""
echo "AgentForge Eval User Seed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Preflight checks ─────────────────────────────────────────

if [ ! -f "$ENV_FILE" ]; then
  echo -e "  ${RED}✗${NC} .env file not found — run: cp .env.example .env"
  exit 1
fi

# Check Ghostfolio is up
if ! curl -sf "$GHOSTFOLIO_URL/api/v1/health" > /dev/null 2>&1; then
  echo -e "  ${RED}✗${NC} Ghostfolio not reachable at $GHOSTFOLIO_URL"
  echo -e "    ${DIM}→ docker compose -f docker/docker-compose.yml up -d${NC}"
  exit 1
fi

# Check if GHOSTFOLIO_API_TOKEN already has a real value
if grep -q '^GHOSTFOLIO_API_TOKEN=' "$ENV_FILE" && ! grep -q '^GHOSTFOLIO_API_TOKEN=<INSERT' "$ENV_FILE"; then
  EXISTING_TOKEN=$(grep '^GHOSTFOLIO_API_TOKEN=' "$ENV_FILE" | cut -d'=' -f2-)
  # Verify it still works
  VERIFY=$(curl -sf -X POST "$GHOSTFOLIO_URL/api/v1/auth/anonymous" \
    -H "Content-Type: application/json" \
    -d "{\"accessToken\": \"$EXISTING_TOKEN\"}" 2>/dev/null || echo "")
  if echo "$VERIFY" | grep -q '"authToken"'; then
    echo -e "  ${GREEN}✓${NC} GHOSTFOLIO_API_TOKEN already valid — skipping seed"
    echo ""
    exit 0
  fi
  echo -e "  ${CYAN}→${NC} Existing token is invalid — creating new eval user"
fi

# ── Create eval user ─────────────────────────────────────────

echo -e "  ${CYAN}→${NC} Creating eval user..."

SIGNUP_RESPONSE=$(curl -sf -X POST "$GHOSTFOLIO_URL/api/v1/user" \
  -H "Content-Type: application/json" 2>&1) || {
  echo -e "  ${RED}✗${NC} Failed to create user. User signup may be disabled."
  echo -e "    ${DIM}If this is not the first user, signup may be restricted.${NC}"
  exit 1
}

ACCESS_TOKEN=$(echo "$SIGNUP_RESPONSE" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  process.stdout.write(data.accessToken || '');
")
AUTH_TOKEN=$(echo "$SIGNUP_RESPONSE" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  process.stdout.write(data.authToken || '');
")

if [ -z "$ACCESS_TOKEN" ] || [ -z "$AUTH_TOKEN" ]; then
  echo -e "  ${RED}✗${NC} Signup response missing tokens"
  echo "    Response: $SIGNUP_RESPONSE"
  exit 1
fi

echo -e "  ${GREEN}✓${NC} Eval user created"

# ── Write token to .env ──────────────────────────────────────

if grep -q '^GHOSTFOLIO_API_TOKEN=' "$ENV_FILE"; then
  # Replace existing line
  sed -i "s|^GHOSTFOLIO_API_TOKEN=.*|GHOSTFOLIO_API_TOKEN=$ACCESS_TOKEN|" "$ENV_FILE"
else
  # Append
  echo "GHOSTFOLIO_API_TOKEN=$ACCESS_TOKEN" >> "$ENV_FILE"
fi

echo -e "  ${GREEN}✓${NC} GHOSTFOLIO_API_TOKEN written to .env"

# ── Seed demo portfolio data ─────────────────────────────────

echo -e "  ${CYAN}→${NC} Seeding demo portfolio..."

# Fixed cash deposit — hardcoded so golden evals can assert exact values.
# DO NOT randomize. Eval assertions depend on this exact amount.
CASH_AMOUNT=10000

IMPORT_RESPONSE=$(curl -sf -X POST "$GHOSTFOLIO_URL/api/v1/import" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d "{
    \"activities\": [

      {\"comment\": \"── US Equities ──\",
        \"currency\": \"USD\", \"dataSource\": \"YAHOO\",
        \"date\": \"2024-01-15T00:00:00.000Z\", \"fee\": 4.99,
        \"quantity\": 10, \"symbol\": \"AAPL\", \"type\": \"BUY\", \"unitPrice\": 185.50},

      {\"currency\": \"USD\", \"dataSource\": \"YAHOO\",
        \"date\": \"2024-02-01T00:00:00.000Z\", \"fee\": 0,
        \"quantity\": 5, \"symbol\": \"GOOGL\", \"type\": \"BUY\", \"unitPrice\": 141.80},

      {\"currency\": \"USD\", \"dataSource\": \"YAHOO\",
        \"date\": \"2024-03-01T00:00:00.000Z\", \"fee\": 4.99,
        \"quantity\": 8, \"symbol\": \"MSFT\", \"type\": \"BUY\", \"unitPrice\": 415.20},

      {\"currency\": \"USD\", \"dataSource\": \"YAHOO\",
        \"date\": \"2024-04-01T00:00:00.000Z\", \"fee\": 0,
        \"quantity\": 3, \"symbol\": \"AMZN\", \"type\": \"BUY\", \"unitPrice\": 180.75},

      {\"comment\": \"── ETFs (broad market + bonds) ──\",
        \"currency\": \"USD\", \"dataSource\": \"YAHOO\",
        \"date\": \"2024-05-01T00:00:00.000Z\", \"fee\": 4.99,
        \"quantity\": 15, \"symbol\": \"VTI\", \"type\": \"BUY\", \"unitPrice\": 252.30},

      {\"currency\": \"USD\", \"dataSource\": \"YAHOO\",
        \"date\": \"2024-05-15T00:00:00.000Z\", \"fee\": 0,
        \"quantity\": 20, \"symbol\": \"BND\", \"type\": \"BUY\", \"unitPrice\": 73.50},

      {\"currency\": \"USD\", \"dataSource\": \"YAHOO\",
        \"date\": \"2024-06-01T00:00:00.000Z\", \"fee\": 0,
        \"quantity\": 10, \"symbol\": \"VXUS\", \"type\": \"BUY\", \"unitPrice\": 57.80},

      {\"comment\": \"── Partial sell (realized gain) ──\",
        \"currency\": \"USD\", \"dataSource\": \"YAHOO\",
        \"date\": \"2024-09-15T00:00:00.000Z\", \"fee\": 4.99,
        \"quantity\": 3, \"symbol\": \"AAPL\", \"type\": \"SELL\", \"unitPrice\": 228.00},

      {\"comment\": \"── Dividends ──\",
        \"currency\": \"USD\", \"dataSource\": \"YAHOO\",
        \"date\": \"2024-05-10T00:00:00.000Z\", \"fee\": 0,
        \"quantity\": 10, \"symbol\": \"AAPL\", \"type\": \"DIVIDEND\", \"unitPrice\": 0.25},

      {\"currency\": \"USD\", \"dataSource\": \"YAHOO\",
        \"date\": \"2024-08-09T00:00:00.000Z\", \"fee\": 0,
        \"quantity\": 10, \"symbol\": \"AAPL\", \"type\": \"DIVIDEND\", \"unitPrice\": 0.25},

      {\"currency\": \"USD\", \"dataSource\": \"YAHOO\",
        \"date\": \"2024-06-13T00:00:00.000Z\", \"fee\": 0,
        \"quantity\": 8, \"symbol\": \"MSFT\", \"type\": \"DIVIDEND\", \"unitPrice\": 0.75},

      {\"currency\": \"USD\", \"dataSource\": \"YAHOO\",
        \"date\": \"2024-09-12T00:00:00.000Z\", \"fee\": 0,
        \"quantity\": 8, \"symbol\": \"MSFT\", \"type\": \"DIVIDEND\", \"unitPrice\": 0.75},

      {\"currency\": \"USD\", \"dataSource\": \"YAHOO\",
        \"date\": \"2024-07-01T00:00:00.000Z\", \"fee\": 0,
        \"quantity\": 15, \"symbol\": \"VTI\", \"type\": \"DIVIDEND\", \"unitPrice\": 0.87},

      {\"comment\": \"── Interest income ──\",
        \"currency\": \"USD\",
        \"date\": \"2024-06-30T00:00:00.000Z\", \"fee\": 0,
        \"quantity\": 1, \"symbol\": \"Interest\", \"type\": \"INTEREST\", \"unitPrice\": 42.50},

      {\"currency\": \"USD\",
        \"date\": \"2024-12-31T00:00:00.000Z\", \"fee\": 0,
        \"quantity\": 1, \"symbol\": \"Interest\", \"type\": \"INTEREST\", \"unitPrice\": 38.75},

      {\"comment\": \"── Account/platform fees ──\",
        \"currency\": \"USD\",
        \"date\": \"2024-06-30T00:00:00.000Z\", \"fee\": 0,
        \"quantity\": 1, \"symbol\": \"Management Fee\", \"type\": \"FEE\", \"unitPrice\": 12.00},

      {\"currency\": \"USD\",
        \"date\": \"2024-12-31T00:00:00.000Z\", \"fee\": 0,
        \"quantity\": 1, \"symbol\": \"Management Fee\", \"type\": \"FEE\", \"unitPrice\": 12.00},

      {\"comment\": \"── Cash deposit ──\",
        \"assetClass\": \"LIQUIDITY\", \"assetSubClass\": \"CASH\",
        \"currency\": \"USD\", \"dataSource\": \"MANUAL\",
        \"date\": \"2024-01-02T00:00:00.000Z\", \"fee\": 0,
        \"quantity\": $CASH_AMOUNT, \"symbol\": \"USD\",
        \"type\": \"BUY\", \"unitPrice\": 1}
    ]
  }" 2>&1) || {
  echo -e "  ${RED}✗${NC} Failed to import portfolio activities"
  echo "    Response: $IMPORT_RESPONSE"
  # Non-fatal — token is already set, evals can still run
}

echo -e "  ${GREEN}✓${NC} Demo portfolio seeded"
echo -e "    ${DIM}Equities:   AAPL(7), GOOGL(5), MSFT(8), AMZN(3)${NC}"
echo -e "    ${DIM}ETFs:       VTI(15), BND(20), VXUS(10)${NC}"
echo -e "    ${DIM}Sold:       AAPL x3 (realized gain)${NC}"
echo -e "    ${DIM}Dividends:  AAPL x2, MSFT x2, VTI x1${NC}"
echo -e "    ${DIM}Interest:   2 payments (\$81.25)${NC}"
echo -e "    ${DIM}Fees:       2 mgmt fees (\$24.00)${NC}"
echo -e "    ${DIM}Cash:       \$10,000${NC}"

# ── Summary ──────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}Ready!${NC} Run evals with:"
echo -e "    ${DIM}npm run eval:golden${NC}"
echo -e "    ${DIM}npm run eval:labeled${NC}"
echo ""
