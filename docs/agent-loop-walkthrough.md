# AgentForge ReAct Loop & Verification Walkthrough

A step-by-step trace of what happens when a user sends a message to the agent.

---

## Step 1: Request Arrives

**File:** `agent.service.ts:201-210`

The user sends `POST /api/v1/chat`. The controller extracts their JWT and userId, then calls `chat()`.

```typescript
const conversationId = request.conversationId ?? randomUUID();
const threadId = `${userId}:${conversationId}`;
const records: ToolCallRecord[] = [];
```

- `conversationId` is reused (multi-turn) or generated fresh
- `threadId = userId:conversationId` — the Redis checkpoint key for LangGraph state
- `records` is a **local** array that accumulates every tool call during this request. It's local (not a class property) to prevent cross-user data leaks under concurrency.

**Chat history:** persists in Redis keyed by `threadId` with a 7-day TTL. As long as the user passes back the same `conversationId`, LangGraph picks up the full message history. The JWT itself is not stored — it's only used per-request for auth and forwarding API calls to Ghostfolio.

---

## Step 2: Load User Context

**File:** `agent.service.ts:213-214`, `_loadUserContext:82-112`

```typescript
const { currency, language, aiPromptContext } =
  await this._loadUserContext(rawJwt);
```

Two Ghostfolio API calls (both swallowed on failure so the agent always starts):

1. `GET /api/v1/user` — fetches base currency and language preference
2. `GET /api/v1/ai/prompt/analysis` — fetches user-provided AI prompt context (custom portfolio notes)

These feed into the system prompt so the LLM knows the user's currency, language, and any custom context they've configured in Ghostfolio.

---

## Step 3: Build the System Prompt

**File:** `system-prompt.builder.ts:4-102`

```typescript
const systemPrompt = buildSystemPrompt(
  { userId, currency, language, aiPromptContext },
  ALL_TOOLS
);
```

Assembles 6 sections into a single string:

1. **Role** — "You are AgentForge, a personal finance AI assistant built on Ghostfolio..."
2. **Date** — today's date
3. **Available Tools** — auto-generated from `ALL_TOOLS`, grouped by category:
   - Data retrieval (read tools)
   - Analysis (analysis tools)
   - Actions requiring confirmation (write tools)
   - Routing instruction: "Pick the most specific tool for the user's question"
4. **User context** — currency, language, sanitized AI prompt context (HTML stripped, capped at 2000 chars, marked as untrusted)
5. **Guardrails** — hard rules the LLM must follow:
   - Never state a figure without calling a tool
   - Never perform arithmetic
   - Never guess at holdings
   - Never give buy/sell advice without confirmation
   - Always cite which tool produced each figure
   - Say "I don't have enough data" rather than speculate
6. **Formatting** — concise, bullet points, prominent risk warnings, user's base currency

The tools section is the routing contract — the LLM reads each tool's `name`, `description`, and `category` here to decide which tool to call.

---

## Step 4: Create Tool Context & Wrap Tools

**File:** `agent.service.ts:221-229`, `_buildLangChainTools:119-146`

```typescript
const toolContext: UserToolContext = {
  userId,
  abortSignal,
  auth: { mode: 'user', jwt: rawJwt },
  client: this.ghostfolioClient
};
const langchainTools = this._buildLangChainTools(toolContext, records);
```

Each `ToolDefinition` from the registry is wrapped in a LangChain `StructuredTool`. The wrapper does three things per call:

1. Calls `def.execute(params, toolContext)` — the actual tool logic, which uses `context.client` to hit the Ghostfolio API with the user's JWT
2. Pushes a `ToolCallRecord` into the per-request `records[]`:
   - tool name, params, raw result JSON, timestamp, duration in ms, success/fail boolean
3. Returns `JSON.stringify(result)` back to the LLM

Every tool call is instrumented — the records array is the full audit trail.

---

## Step 5: Run the ReAct Loop

**File:** `agent.service.ts:230-235`

```typescript
const agent = this._buildAgent(systemPrompt, langchainTools);
const result = await agent.invoke(
  { messages: [new HumanMessage(request.message)] },
  { configurable: { thread_id: threadId } }
);
```

`createReactAgent` from LangGraph runs the standard ReAct cycle:

```
LLM sees system prompt + conversation history + new user message
  → decides to call a tool (or respond directly)
    → tool executes, result fed back to LLM (and recorded in records[])
      → LLM decides: call another tool or produce final response
        → repeat until done
```

The `thread_id` routes to `RedisCheckpointSaver` — conversation state (all messages, tool results, graph position) is checkpointed to Redis after each step.

---

## Step 6: Interrupt Detection (HITL Branch)

**File:** `agent.service.ts:238-274`

If a write tool called `interrupt()` during execution, LangGraph pauses the graph mid-step.

```typescript
if (isInterrupted(result)) {
  // Extract interrupt payload: toolName, proposedParams, description
  // Create PendingAction with 15-minute expiry
  // Store in Redis via PendingActionsService
  // Return early — no verification (there's no final response text yet)
  return {
    message: '',
    conversationId,
    toolCalls: records,
    pendingConfirmations: [pendingAction],
    warnings: [], flags: []
  };
}
```

The user sees the proposed action in the chat widget. They can approve or reject via `POST /api/v1/actions/:id/approve`. On approval, the `resume()` method reconstructs the full agent (same system prompt, same tools) and calls `agent.invoke(new Command({ resume: params }))` to continue from the paused point. The resumed response then goes through the same verification pipeline (step 7).

---

## Step 7: Verification Pipeline

**File:** `agent.service.ts:276-282`, `_buildVerifiedResponse:175-195`, `verification.service.ts:34-77`

If no interrupt, the final LLM message is extracted and verified:

```typescript
const agentResponse = this._extractLastMessage(result);
return await this._buildVerifiedResponse(agentResponse, records, conversationId, userId);
```

`_buildVerifiedResponse` calls `this.verificationService.runAll(agentResponse, records, userId)`.

### How `runAll` works:

Iterates all registered verifiers **in order** (sorted by `order` field). For each:

1. Call `verifier.verify(response, toolCalls)` inside a try/catch
2. Collect `warnings` (soft — informational) and `flags` (hard — something is wrong)
3. If a verifier throws, log and skip — **the pipeline never short-circuits**

Current verifiers:

| Order | Verifier                    | What it checks                                                                                                                                            |
| ----- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10    | `SourceAttributionVerifier` | Scans response for `$` and `%` patterns. If financial figures appear but no tool call results back them up, emits a warning for unsourced claims.         |
| 40    | `ConfidenceVerifier`        | Assigns high/medium/low confidence based on tool call count. Downgrades for hedging language ("approximately", "I think", etc.). Warns on low confidence. |

If any warnings or flags were emitted, they're persisted to SQLite via `InsightRepository` as a verification insight record for later analysis.

---

## Step 8: Response Assembly

**File:** `agent.service.ts:187-195`

The final `ChatResponse` sent back to the client:

```typescript
{
  message: agentResponse,           // LLM's final text
  conversationId,                   // for multi-turn continuity
  toolCalls: records,               // full audit trail of every tool invocation
  pendingConfirmations: [],         // empty on happy path
  warnings: ["unsourced claim..."], // soft findings from verifiers
  flags: []                         // hard failures from verifiers
}
```

---

## Error Handling

**File:** `agent.service.ts:283-294`

The entire flow is wrapped in a try/catch. On any unhandled error:

- Log the error
- Return a graceful message ("I encountered an error...") with whatever `records` were accumulated before the failure
- Empty warnings/flags — verification didn't run, so no findings to report

---

## Visual Summary

```
POST /api/v1/chat
  │
  ▼
Step 1: Setup — conversationId, threadId, empty records[]
  │
  ▼
Step 2: Load user context from Ghostfolio (currency, language, AI prompt)
  │
  ▼
Step 3: Build system prompt (role + tools + guardrails + user context)
  │
  ▼
Step 4: Wrap tools with instrumentation (each call → ToolCallRecord)
  │
  ▼
Step 5: ReAct loop — LLM ↔ tools until done, checkpointed to Redis
  │
  ▼
Step 6: Interrupted?
  ├─ YES → store PendingAction → return early (user approves/rejects)
  │          └→ resume() → tool completes → Step 7
  │
  └─ NO → Step 7
           │
           ▼
        Step 7: Verification pipeline
           ├→ SourceAttributionVerifier (order 10)
           ├→ ConfidenceVerifier (order 40)
           └→ persist insights if findings
              │
              ▼
        Step 8: Return ChatResponse { message, toolCalls, warnings, flags }
```
