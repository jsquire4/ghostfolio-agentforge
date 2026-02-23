# Pre-Search Document

**Project:** AgentForge — Finance Domain (Ghostfolio)
**Date:** 2026-02-23
**Author:** [Your Name]

---

## Phase 1: Define Your Constraints

### 1. Domain Selection

- **Domain:** Personal finance / wealth management
- **Use cases:**
  - Portfolio health analysis (concentration risk, diversification)
  - Tax optimization (harvest opportunities, wash sale compliance)
  - Transaction logging via natural language
  - Rebalancing recommendations with human confirmation gate
  - Background insight generation surfaced in the UI
- **Verification requirements:** Every financial claim must be sourced to a tool call. Concentration risk flagged at >20% per position, wash sale rule enforced (30-day repurchase window), confidence scoring on tax estimates, stale data flagging (>24h)
- **Data sources:** Mix of Ghostfolio's existing provider abstraction (Yahoo Finance, CoinGecko, Alpha Vantage, Financial Modeling Prep, EOD Historical Data) + direct external APIs where Ghostfolio's abstraction doesn't cover the need

### 2. Scale & Performance

- Architecture designed for production scale, deployed on demo-tier infrastructure for this sprint
- **Latency targets:** Spec floor: <5s single-tool, <15s multi-step. Aspirational: <2s single-tool, <10s multi-step — faster responses also reduce cost per query
- **Concurrency:** Stateless agent design via JWT forwarding — Redis-backed conversation isolation supports horizontal scaling without re-architecture
- **Cost constraints:** Target <$1 per most complex multi-step/multi-ReAct-loop call. Optimize token usage (summarize tool results before LLM synthesis) so more capable models remain cost-viable. Response time reduction is a natural cost lever — faster loops = fewer tokens = lower spend

### 3. Reliability Requirements

- **Cost of a wrong answer:** Real financial loss — tax penalties, over-concentrated positions, missed wash sale violations
- **Non-negotiable verification:** No financial figure stated without tool call source attribution
- **Human-in-the-loop:** User-configurable HITL preferences — default requires explicit confirmation on all write operations (log transaction, import, watchlist update). Users can relax to high-risk-only once comfortable. Confirmation gate enforced server-side regardless of setting.
- **Audit:** All agent logs saved, accessible, and auditable. Initial implementation via LangSmith tracing (every tool call, input, output). Architecture should enable regulatory-grade audit trails as a future extension.

### 4. Team & Skill Constraints

- TypeScript: comfortable
- NestJS: moderate — will pattern-match from existing Ghostfolio codebase
- Finance domain: BS in Finance — strong domain credibility for eval design and verification logic
- Agent frameworks: no prior experience before Gauntlet & Collabboard — this project is a learning opportunity
- Eval/testing: familiar with concepts but haven't built LLM eval frameworks — will learn alongside implementation

---

## Phase 2: Architecture Discovery

### 5. Agent Framework Selection

- **Selected: LangChain**
  - Flexible agent architectures with extensive tool integrations
  - Good documentation and large community — helpful given no prior agent framework experience
  - Supports multi-agent patterns and handoffs
  - Native TypeScript support via LangChain.js
- **Architecture:** Likely multi-agent with handoffs by task domain (chat, compliance, portfolio analysis, etc.). Exact topology TBD during implementation — start with a single orchestrator agent and split responsibilities as complexity warrants.
- **State management:** Redis for conversation history (keyed by user ID), SQLite on Docker volume for persisted insights
- **Isolation:** Agent runs as a separate container — independently deployable from Ghostfolio

### 6. LLM Selection

- **Strategy:** Tiered model selection based on task complexity
  - Single-shot tools / simple tasks → cheaper models (GPT-4o-mini)
  - Complex multi-step reasoning / compliance checks → larger models (GPT-5, Claude Sonnet 4.5)
  - If single-agent approach: Claude Sonnet 4 or 4.5 as primary
- **Function calling:** Critical — agent relies heavily on structured tool use
- **Context window:** Moderate — will summarize/truncate tool results and conversation history to keep context lean rather than passing everything raw
- **Provider:** OpenRouter + Anthropic API -- or if OpenRouter works with Anthropic still? Not sure, but whatever enables flexibility in model calling

### 7. Tool Design

**Read tools** (execute without confirmation):

| Tool                       | Ghostfolio Endpoint                 | Returns                                               |
| -------------------------- | ----------------------------------- | ----------------------------------------------------- |
| `portfolio_summary`        | `GET /api/v1/portfolio/details`     | Total value, currency, holdings count, last updated   |
| `get_holdings`             | `GET /api/v1/portfolio/holdings`    | Positions with allocation %, asset class, performance |
| `get_performance`          | `GET /api/v1/portfolio/performance` | Returns over period, absolute gain, annualized        |
| `get_transactions`         | `GET /api/v1/order`                 | Filtered transaction history                          |
| `concentration_risk_check` | Derived from holdings               | Positions >20% with severity rating                   |

**Write tools** (return pending state, require explicit user confirmation):

| Tool                  | Ghostfolio Endpoint             | Action                    |
| --------------------- | ------------------------------- | ------------------------- |
| `log_transaction`     | `POST /api/v1/order`            | Record a new trade        |
| `update_watchlist`    | `POST/DELETE /api/v1/watchlist` | Add or remove symbol      |
| `import_transactions` | `POST /api/v1/import`           | Bulk import from CSV/JSON |

**Background tools** (scheduled, results persisted to SQLite insights store):

| Tool                   | Schedule | Output                                          |
| ---------------------- | -------- | ----------------------------------------------- |
| `tax_harvest_scan`     | Weekly   | Unrealized losses + wash sale window violations |
| `rebalancing_analysis` | Weekly   | Current vs target allocation drift              |
| `weekly_health_report` | Weekly   | Full insight suite                              |

- **Error handling:** All tools return `{ success, data, error, source, calledAt }`. Agent retries on transient failures. Critical errors (e.g., portfolio balance lookup fails) are surfaced to the user rather than silently swallowed.
- **Data routing:** Most tool calls routed through Ghostfolio's existing data provider abstraction. Direct external APIs for tax rules/regulations where Ghostfolio's abstraction doesn't cover the need — specific APIs TBD during implementation.
- **Mock vs real data:** Mock Ghostfolio API responses for development and unit testing. Real Ghostfolio instance for integration tests and demo deployment.

### 8. Observability Strategy

- **Selected: LangSmith**
  - Free tier sufficient for demo scale
  - Native LangChain integration — straightforward tracing setup
  - Eval datasets and scoring built in
- **Priority metrics:** Full request trace (input → reasoning → tool calls → output), latency breakdown (LLM vs tool execution vs total), token usage and cost per query, error tracking and categorization, eval scores and regression detection
- **Monitoring:** Near-real-time — traces viewable within minutes, not batch
- **Sensitive data:** No redaction needed — demo data only
- **Production path:** LangSmith eval triggers for regression alerting on redeploy

### 9. Eval Approach

- **Dataset:** 50+ test cases across 4 categories (details in Section 14)
- **Correctness:** Portfolio math is deterministic — verifiable against known inputs. Compliance checks use a combination of agent-as-judge + human review for edge case judgments.
- **Ground truth:** Known financial inputs with pre-calculated expected outputs
- **Automation:** Mostly automated — eval runner scores against expected tool calls + output. Human review for compliance edge cases and ambiguous scenarios.
- **CI integration:** Manual trigger — run evals on demand rather than on every rebuild. Can move to automated CI gate once eval suite is stable.
- **Scoring dimensions:** Correctness, tool selection accuracy, tool execution success, safety/refusal, consistency, latency

### 10. Verification Design

| Verification            | Implementation                                                  | Trigger             |
| ----------------------- | --------------------------------------------------------------- | ------------------- |
| Source attribution      | Every response cites tool calls that produced it                | Always              |
| Hallucination detection | Claims without a tool call source are flagged and blocked       | Always              |
| Concentration risk      | Positions >20% flagged with severity level                      | Holdings queries    |
| Wash sale rule          | 30-day repurchase window checked on sell transactions           | Transaction log     |
| Confidence scoring      | Tax estimates include confidence % + mandatory caveats          | Tax-related queries |
| Stale data              | Data >24h flagged before use in any claim                       | All tool calls      |
| Human-in-the-loop       | Write operations return pending state, require explicit confirm | All write tools     |

---

## Phase 3: Post-Stack Refinement

### 11. Failure Mode Analysis

| Failure                            | Handling Strategy                                                         |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Tool timeout (Ghostfolio API slow) | 3s timeout per tool call, graceful user message, suggest retry            |
| Stale market data                  | Flag staleness explicitly, proceed with caveat rather than silent failure |
| LLM refuses query                  | Catch refusal pattern, return structured error, log to LangSmith          |
| Invalid portfolio state            | Validate tool response schema before passing to LLM synthesis             |
| Redis unavailable                  | Fallback to in-memory conversation history — degrade gracefully           |
| JWT expired mid-conversation       | Return 401 with re-auth prompt, preserve conversation context             |
| Ghostfolio API unavailable         | Return service unavailable, no hallucinated data as substitute            |

### 12. Security Considerations

- **Prompt injection:** System prompt hardened — user input never interpolated into system context
- **Data leakage:** Demo data only — no real user financial data in traces. Production would require redaction at middleware layer.
- **API keys:** Environment variables only — never in source code or traces
- **JWT:** Verified on every agent request using shared `JWT_SECRET_KEY` with Ghostfolio
- **Write authorization:** Tool confirmation gate enforced server-side — cannot be bypassed via prompt
- **Audit logging:** Every write operation logged with user ID, timestamp, tool name, and parameters

### 13. Testing Strategy

| Layer       | Approach                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Each tool tested in isolation with mocked Ghostfolio API responses                                                        |
| Integration | Full agent flows — multi-step reasoning chains end-to-end                                                                 |
| Adversarial | "Skip confirmation," "ignore previous instructions," invalid symbols, negative quantities, requests for other users' data |
| Regression  | Eval suite runs on every deploy — scores tracked over time in LangSmith                                                   |
| Latency     | P95 response time tracked per tool and per query type                                                                     |

### 14. Open Source Contribution

- **Selected: Eval Dataset**
- **What:** 50+ financial agent test cases covering portfolio analysis, compliance checks, tax scenarios, and adversarial inputs
- **Why this:** Domain-credentialed ground truth (BS Finance) for financial agent benchmarking — high-quality finance evals are genuinely scarce. A CS-background dataset guesses at edge cases; these are grounded in actual financial rules and regulations.
- **Contents per test case:** input query, expected tool calls, expected output, pass/fail criteria, domain rationale, regulatory reference where applicable
- **Publication:** GitHub repository, MIT license
- **Potential extension:** HuggingFace dataset card for discoverability by other finance agent builders

### 15. Deployment & Operations

**Development:**

```
Docker Compose
├── ghostfolio api    :3333
├── postgres          :5432
├── redis             :6379
└── agent             :8000
```

**Demo deployment:**

- Agent container → Railway or Render (independent from Ghostfolio)
- Managed Postgres → Railway or Supabase
- Redis → Railway managed Redis or Upstash

**CI/CD:**

- GitHub Actions: build → test → eval suite → deploy agent container
- Agent deploys independently — Ghostfolio image untouched on agent changes
- Rollback: agent container versioned, previous image re-deployable in <2 minutes

**Monitoring:**

- LangSmith: agent observability, eval regression detection
- Railway/Render metrics: container health, memory, latency

### 16. Iteration Planning

- **User feedback:** Thumbs up/down on each agent response, stored with LangSmith trace ID
- **Eval-driven cycle:** Failing evals surface as GitHub issues; fixes require new passing test before merge
- **Feature roadmap:**
  1. Background insights (concentration, diversification) — MVP+1
  2. Wash sale compliance check — Friday checkpoint
  3. Rebalancing recommendations — Friday checkpoint
  4. Tax harvest analysis — Final submission
- **Maintenance:** Eval dataset versioned alongside agent — new tools require new test cases before merge

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Docker Network: ghostfolio_network                          │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  ghostfolio  │  │   postgres   │  │    redis     │      │
│  │  api :3333   │  │    :5432     │  │    :6379     │      │
│  └──────┬───────┘  └──────────────┘  └──────┬───────┘      │
│         │  (internal HTTP)                   │              │
│         ▼                                    ▼              │
│  ┌───────────────────────────────────────────────────┐      │
│  │              agent :8000                          │      │
│  │                                                   │      │
│  │  GET  /v1/health                                  │      │
│  │  GET  /v1/tools       ← tool registry metadata   │      │
│  │  POST /v1/chat        ← conversational agent     │      │
│  │  GET  /v1/insights    ← persisted analysis       │      │
│  │  POST /v1/evals/run   ← trigger eval suite       │      │
│  │  GET  /v1/evals/results                          │      │
│  │                                                   │      │
│  │  LangChain.js + OpenRouter (tiered models)       │      │
│  │  LangSmith tracing                                │      │
│  │  SQLite (insights store, Docker volume)           │      │
│  └───────────────────────────────────────────────────┘      │
│         ▲                                                    │
│         │ JWT forwarded from Angular                        │
│         │                                                    │
│  ┌──────┴───────────────────────────────────────────┐       │
│  │           ghostfolio angular client              │       │
│  │                                                  │       │
│  │  /portfolio/x-ray  ← AI Insights panel          │       │
│  │  /ai               ← Chat module                │       │
│  └──────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

---

## Open Questions / Decisions Deferred to Implementation

- [ ] Streaming vs. request/response for chat endpoint (affects Angular component design)
- [ ] Conversation history TTL in Redis (24h? 7 days? session-only?)
- [ ] Background job scheduler — cron inside agent container vs. Ghostfolio's existing Bull queue
- [ ] Insight freshness policy — how stale before UI prompts re-run?
- [ ] Multi-agent architecture details — when does background agent hand off to conversational agent?
