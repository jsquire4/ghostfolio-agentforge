#!/usr/bin/env bash
# AgentForge one-command setup.
# Creates .env, starts Docker, seeds DB + eval user, starts agent.
#
# Usage: ./scripts/setup.sh
#   or:  npm run setup

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

echo ""
echo -e "${BOLD}AgentForge Setup${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Preflight ─────────────────────────────────────────────────

if ! command -v docker &> /dev/null; then
  echo -e "${RED}✗${NC} Docker not found. Install it: https://docs.docker.com/get-docker/"
  exit 1
fi

if ! command -v node &> /dev/null; then
  echo -e "${RED}✗${NC} Node.js not found. Install Node 22+."
  exit 1
fi

if [ ! -f "package.json" ]; then
  echo -e "${RED}✗${NC} Run this script from the repo root (where package.json is)."
  exit 1
fi

# ── Step 1: .env ──────────────────────────────────────────────

echo -e "${BOLD}Step 1/5:${NC} Environment configuration"

if [ -f ".env" ]; then
  echo -e "  ${GREEN}✓${NC} .env already exists"

  # Check if OAI key is set
  if grep -q '^OPENAI_API_KEY=' .env && ! grep -q '^OPENAI_API_KEY=<INSERT' .env; then
    echo -e "  ${GREEN}✓${NC} OPENAI_API_KEY already configured"
  else
    echo ""
    echo -e "  ${CYAN}Enter your OpenAI API key:${NC}"
    read -rp "  > " OAI_KEY
    if [ -z "$OAI_KEY" ]; then
      echo -e "  ${RED}✗${NC} No key entered — you can set OPENAI_API_KEY in .env later"
    else
      if grep -q '^OPENAI_API_KEY=' .env; then
        sed -i "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=$OAI_KEY|" .env
      else
        echo "OPENAI_API_KEY=$OAI_KEY" >> .env
      fi
      echo -e "  ${GREEN}✓${NC} OPENAI_API_KEY saved to .env"
    fi
  fi

  # Check if LangSmith key is set
  if grep -q '^LANGSMITH_API_KEY=' .env && ! grep -q '^LANGSMITH_API_KEY=<INSERT' .env; then
    echo -e "  ${GREEN}✓${NC} LANGSMITH_API_KEY already configured"
  else
    echo ""
    echo -e "  ${CYAN}Enter your LangSmith API key ${DIM}(optional — enables trace observability)${NC}:"
    read -rp "  > " LS_KEY
    if [ -z "$LS_KEY" ]; then
      echo -e "  ${YELLOW}!${NC} No key entered — LangSmith tracing will be disabled"
    else
      if grep -q '^LANGSMITH_API_KEY=' .env; then
        sed -i "s|^LANGSMITH_API_KEY=.*|LANGSMITH_API_KEY=$LS_KEY|" .env
      else
        echo "LANGSMITH_API_KEY=$LS_KEY" >> .env
      fi
      if ! grep -q '^LANGSMITH_PROJECT=' .env; then
        echo "LANGSMITH_PROJECT=ghostfolio-agent" >> .env
      fi
      if ! grep -q '^LANGCHAIN_TRACING_V2=' .env; then
        echo "LANGCHAIN_TRACING_V2=true" >> .env
      else
        sed -i "s|^LANGCHAIN_TRACING_V2=.*|LANGCHAIN_TRACING_V2=true|" .env
      fi
      if ! grep -q '^LANGCHAIN_CALLBACKS_BACKGROUND=' .env; then
        echo "LANGCHAIN_CALLBACKS_BACKGROUND=true" >> .env
      fi
      echo -e "  ${GREEN}✓${NC} LANGSMITH_API_KEY saved + tracing enabled"
    fi
  fi
else
  cp .env.example .env
  echo -e "  ${GREEN}✓${NC} Created .env from .env.example"

  # Generate random passwords/salts for fresh installs
  RAND_REDIS=$(openssl rand -base64 16 2>/dev/null || node -e "console.log(require('crypto').randomBytes(16).toString('base64'))")
  RAND_PG=$(openssl rand -base64 16 2>/dev/null || node -e "console.log(require('crypto').randomBytes(16).toString('base64'))")
  RAND_SALT=$(openssl rand -base64 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  RAND_JWT=$(openssl rand -base64 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

  sed -i "s|REDIS_PASSWORD=<INSERT_REDIS_PASSWORD>|REDIS_PASSWORD=$RAND_REDIS|" .env
  sed -i "s|POSTGRES_PASSWORD=<INSERT_POSTGRES_PASSWORD>|POSTGRES_PASSWORD=$RAND_PG|" .env
  sed -i "s|ACCESS_TOKEN_SALT=<INSERT_RANDOM_STRING>|ACCESS_TOKEN_SALT=$RAND_SALT|" .env
  sed -i "s|JWT_SECRET_KEY=<INSERT_RANDOM_STRING>|JWT_SECRET_KEY=$RAND_JWT|" .env

  echo -e "  ${GREEN}✓${NC} Generated random secrets (Redis, Postgres, JWT, salt)"

  # Prompt for OAI key
  echo ""
  echo -e "  ${CYAN}Enter your OpenAI API key ${DIM}(required for agent LLM calls)${NC}:"
  read -rp "  > " OAI_KEY
  if [ -z "$OAI_KEY" ]; then
    echo -e "  ${YELLOW}!${NC} No key entered — set OPENAI_API_KEY in .env before running evals"
  else
    sed -i "s|OPENAI_API_KEY=<INSERT_OPENAI_API_KEY>|OPENAI_API_KEY=$OAI_KEY|" .env
    echo -e "  ${GREEN}✓${NC} OPENAI_API_KEY saved"
  fi

  # Prompt for LangSmith observability
  echo ""
  echo -e "  ${CYAN}Enter your LangSmith API key ${DIM}(optional — enables trace observability)${NC}:"
  read -rp "  > " LS_KEY
  if [ -z "$LS_KEY" ]; then
    echo -e "  ${YELLOW}!${NC} No key entered — LangSmith tracing will be disabled"
    sed -i "s|LANGCHAIN_TRACING_V2=true|LANGCHAIN_TRACING_V2=false|" .env
  else
    sed -i "s|LANGSMITH_API_KEY=<INSERT_LANGSMITH_API_KEY>|LANGSMITH_API_KEY=$LS_KEY|" .env
    echo -e "  ${GREEN}✓${NC} LANGSMITH_API_KEY saved"

    echo -e "  ${CYAN}Enter LangSmith project name ${DIM}(default: ghostfolio-agent)${NC}:"
    read -rp "  > " LS_PROJECT
    if [ -n "$LS_PROJECT" ]; then
      sed -i "s|LANGSMITH_PROJECT=ghostfolio-agent|LANGSMITH_PROJECT=$LS_PROJECT|" .env
      echo -e "  ${GREEN}✓${NC} LANGSMITH_PROJECT set to $LS_PROJECT"
    else
      echo -e "  ${GREEN}✓${NC} Using default project: ghostfolio-agent"
    fi
    echo -e "  ${GREEN}✓${NC} LangSmith tracing enabled"
  fi
fi

echo ""

# ── Step 2: npm install ──────────────────────────────────────

echo -e "${BOLD}Step 2/5:${NC} Dependencies"

if [ -d "node_modules" ]; then
  echo -e "  ${GREEN}✓${NC} node_modules exists — skipping install"
else
  echo -e "  ${CYAN}→${NC} Running npm install..."
  npm install --silent
  echo -e "  ${GREEN}✓${NC} Dependencies installed"
fi

echo ""

# ── Step 3: Docker ────────────────────────────────────────────

echo -e "${BOLD}Step 3/5:${NC} Starting Docker services"
echo -e "  ${CYAN}→${NC} Starting postgres, redis, ghostfolio..."

docker compose -f docker/docker-compose.yml up -d postgres redis ghostfolio 2>&1 | while read -r line; do
  echo -e "    ${DIM}$line${NC}"
done

# Wait for Ghostfolio to be healthy
echo -e "  ${CYAN}→${NC} Waiting for Ghostfolio to be ready..."
RETRIES=0
MAX_RETRIES=30
until curl -sf http://localhost:3333/api/v1/health > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo -e "  ${RED}✗${NC} Ghostfolio did not become healthy after ${MAX_RETRIES}0s"
    echo -e "    ${DIM}Check logs: docker compose -f docker/docker-compose.yml logs ghostfolio${NC}"
    exit 1
  fi
  sleep 10
done

echo -e "  ${GREEN}✓${NC} Ghostfolio healthy at localhost:3333"
echo ""

# ── Step 4: Database + Eval user ──────────────────────────────

echo -e "${BOLD}Step 4/5:${NC} Database setup + eval user"

echo -e "  ${CYAN}→${NC} Running database setup (migrate + seed)..."
npm run database:setup 2>&1 | tail -3 | while read -r line; do
  echo -e "    ${DIM}$line${NC}"
done
echo -e "  ${GREEN}✓${NC} Database ready"

echo -e "  ${CYAN}→${NC} Seeding eval user + demo portfolio..."
./scripts/seed-eval-user.sh 2>&1 | while read -r line; do
  echo -e "  $line"
done

echo ""

# ── Step 5: Build agent ──────────────────────────────────────

echo -e "${BOLD}Step 5/5:${NC} Agent"
echo -e "  ${CYAN}→${NC} Building agent..."
npm run build:agent 2>&1 | tail -1 | while read -r line; do
  echo -e "    ${DIM}$line${NC}"
done
echo -e "  ${GREEN}✓${NC} Agent built"

# ── Done ──────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}${BOLD}Setup complete!${NC}"
echo ""
echo -e "  Start the agent:        ${DIM}npm run start:agent${NC}"
echo -e "  Run golden evals:       ${DIM}npm run eval:golden${NC}"
echo -e "  Run labeled evals:      ${DIM}npm run eval:labeled${NC}"
echo -e "  Run all evals:          ${DIM}npm run eval${NC}"
echo -e "  Open Ghostfolio UI:     ${DIM}http://localhost:3333${NC}"
echo ""
