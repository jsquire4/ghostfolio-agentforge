#!/usr/bin/env bash
# Pre-eval setup validation — checks everything needed before running evals.
# Usage: ./scripts/check-setup.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0

check() {
  local label="$1"
  local result="$2"
  local fix="${3:-}"

  if [ "$result" = "ok" ]; then
    echo -e "  ${GREEN}✓${NC} $label"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $label"
    if [ -n "$fix" ]; then
      echo -e "    ${YELLOW}→ $fix${NC}"
    fi
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "AgentForge Setup Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── .env file ────────────────────────────────────────────────
echo ""
echo "Environment:"

if [ -f .env ]; then
  check ".env file exists" "ok"
else
  check ".env file exists" "fail" "cp .env.example .env && edit with your keys"
fi

for key in JWT_SECRET_KEY REDIS_PASSWORD POSTGRES_PASSWORD; do
  if [ -f .env ] && grep -q "^${key}=" .env && ! grep -q "^${key}=<INSERT" .env; then
    check "$key is set" "ok"
  else
    check "$key is set" "fail" "Set $key in .env"
  fi
done

# Check optional API keys
if [ -f .env ] && grep -q "^OPENAI_API_KEY=" .env && ! grep -q "^OPENAI_API_KEY=<INSERT" .env; then
  check "OPENAI_API_KEY is set" "ok"
else
  check "OPENAI_API_KEY is set" "fail" "Set OPENAI_API_KEY in .env (required for labeled evals)"
fi

# ── Docker services ──────────────────────────────────────────
echo ""
echo "Services:"

if command -v docker &> /dev/null; then
  check "Docker installed" "ok"
else
  check "Docker installed" "fail" "Install Docker: https://docs.docker.com/get-docker/"
fi

# Check Ghostfolio health
if curl -sf http://localhost:3333/api/v1/health > /dev/null 2>&1; then
  check "Ghostfolio API (port 3333)" "ok"
else
  check "Ghostfolio API (port 3333)" "fail" "docker compose -f docker/docker-compose.yml up -d"
fi

# Check Agent health
if curl -sf http://localhost:8000/api/v1/health > /dev/null 2>&1; then
  check "Agent API (port 8000)" "ok"
else
  check "Agent API (port 8000)" "fail" "npm run build:agent && docker compose -f docker/docker-compose.yml up -d"
fi

# Check tool count
TOOLS_RESPONSE=$(curl -sf http://localhost:8000/api/v1/tools 2>/dev/null || echo "[]")
TOOL_COUNT=$(echo "$TOOLS_RESPONSE" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
if [ "$TOOL_COUNT" -gt 0 ] 2>/dev/null; then
  check "Agent has $TOOL_COUNT tool(s) registered" "ok"
else
  check "Agent has tools registered" "fail" "Ensure agent is running and tools are registered"
fi

# Check Redis
if command -v docker &> /dev/null && docker exec gf-redis redis-cli ping > /dev/null 2>&1; then
  check "Redis (port 6379)" "ok"
else
  check "Redis (port 6379)" "fail" "docker compose -f docker/docker-compose.yml up -d redis"
fi

# Check Postgres
if command -v docker &> /dev/null && docker exec gf-postgres pg_isready > /dev/null 2>&1; then
  check "PostgreSQL (port 5432)" "ok"
else
  check "PostgreSQL (port 5432)" "fail" "docker compose -f docker/docker-compose.yml up -d postgres"
fi

# ── Build artifacts ──────────────────────────────────────────
echo ""
echo "Build:"

if [ -f dist/apps/agent/main.js ]; then
  check "Agent build exists" "ok"
else
  check "Agent build exists" "fail" "npm run build:agent"
fi

# ── Summary ──────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}All $TOTAL checks passed${NC} — ready to run evals"
else
  echo -e "  ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC} — fix issues above before running evals"
  exit 1
fi
echo ""
