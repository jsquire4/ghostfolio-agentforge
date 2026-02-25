import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { HumanMessage } from '@langchain/core/messages';
import { StructuredTool, tool } from '@langchain/core/tools';
import { isInterrupted, INTERRUPT, Command } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

import { AuditService } from '../audit/audit.service';
import {
  ChatRequest,
  ChatResponse,
  PendingAction,
  RequestMetrics,
  ToolCallRecord,
  ToolResult,
  UserToolContext
} from '../common/interfaces';
import { MetricsRepository } from '../database/metrics.repository';
import { GhostfolioClientService } from '../ghostfolio/ghostfolio-client.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { ALL_TOOLS } from '../tools/index';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { VerificationService } from '../verification/verification.service';
import { HitlMatrixService } from './hitl-matrix.service';
import { estimateCostUsd } from './llm-cost-rates';
import { PendingActionsService } from './pending-actions.service';
import { RedisCheckpointSaver } from './redis-checkpoint.saver';
import { buildSystemPrompt } from './system-prompt.builder';

class TokenAccumulator extends BaseCallbackHandler {
  name = 'TokenAccumulator';
  tokensIn = 0;
  tokensOut = 0;

  handleLLMEnd(output: {
    llmOutput?: {
      tokenUsage?: { promptTokens?: number; completionTokens?: number };
    };
  }): void {
    this.tokensIn += output.llmOutput?.tokenUsage?.promptTokens ?? 0;
    this.tokensOut += output.llmOutput?.tokenUsage?.completionTokens ?? 0;
  }
}

@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);
  private checkpointSaver!: RedisCheckpointSaver;
  private llm!: ChatOpenAI;
  private modelName!: string;

  constructor(
    private readonly ghostfolioClient: GhostfolioClientService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly verificationService: VerificationService,
    private readonly pendingActionsService: PendingActionsService,
    private readonly hitlMatrixService: HitlMatrixService,
    private readonly auditService: AuditService,
    private readonly metricsRepository: MetricsRepository,
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis
  ) {}

  onModuleInit(): void {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not configured — agent cannot start without an LLM provider'
      );
    }

    this.checkpointSaver = new RedisCheckpointSaver(this.redisClient);
    this.modelName = 'gpt-4o-mini';
    this.llm = new ChatOpenAI({
      model: this.modelName,
      temperature: 0,
      maxTokens: 2048,
      timeout: 30000
    });

    // Register all tools from the barrel — no manual manifest editing required
    ALL_TOOLS.forEach((t) => this.toolRegistry.register(t));

    this.logger.log(
      'AgentService initialized — tools registered, LLM configured'
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Load user settings and AI prompt context from Ghostfolio. Failures are
   *  swallowed so the agent always has a usable (possibly empty) context. */
  private async _loadUserContext(rawJwt: string): Promise<{
    currency?: string;
    language?: string;
    aiPromptContext?: string;
  }> {
    let currency: string | undefined;
    let language: string | undefined;
    let aiPromptContext: string | undefined;

    try {
      const user = await this.ghostfolioClient.get<{
        settings: { baseCurrency?: string; language?: string };
      }>('/api/v1/user', { mode: 'user', jwt: rawJwt });
      currency = user.settings?.baseCurrency;
      language = user.settings?.language;
    } catch {
      // User context load failed — proceed with defaults
    }

    try {
      const prompt = await this.ghostfolioClient.get<{ prompt: string }>(
        '/api/v1/ai/prompt/analysis',
        { mode: 'user', jwt: rawJwt }
      );
      aiPromptContext = prompt.prompt;
    } catch {
      // AI prompt context load failed — proceed without it
    }

    return { currency, language, aiPromptContext };
  }

  /** Wrap every registered tool definition in a LangChain StructuredTool that
   *  records call metadata into the caller-owned `records` array.
   *
   *  `records` MUST be a local variable in the caller — never a class property
   *  (class property would cause cross-user data leaks under concurrent requests). */
  private _buildLangChainTools(
    toolContext: UserToolContext,
    records: ToolCallRecord[]
  ): StructuredTool[] {
    return this.toolRegistry.getAll().map((def) =>
      tool(
        async (params: unknown) => {
          const start = Date.now();
          const result: ToolResult = await def.execute(params, toolContext);
          const success = !result.error;
          records.push({
            toolName: def.name,
            params,
            result: JSON.stringify(result),
            calledAt: new Date().toISOString(),
            durationMs: Date.now() - start,
            success
          });
          return JSON.stringify(result);
        },
        {
          name: def.name,
          description: def.description,
          schema: def.schema
        }
      )
    );
  }

  /** Compile a fresh ReAct agent for a single request.
   *  Tools close over the per-request JWT so the agent must never be reused
   *  across calls. */
  private _buildAgent(
    systemPrompt: string,
    langchainTools: StructuredTool[]
  ): ReturnType<typeof createReactAgent> {
    return createReactAgent({
      llm: this.llm,
      tools: langchainTools,
      prompt: systemPrompt,
      checkpointSaver: this.checkpointSaver
    });
  }

  /** Extract the final text response from the agent invoke result. */
  private _extractLastMessage(result: unknown): string {
    const messages = (result as { messages?: unknown[] }).messages ?? [];
    const lastMessage = messages[messages.length - 1] as
      | { content?: unknown }
      | undefined;
    return typeof lastMessage?.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage?.content ?? '');
  }

  /** Run verification and assemble the final ChatResponse. */
  private async _buildVerifiedResponse(
    agentResponse: string,
    records: ToolCallRecord[],
    conversationId: string,
    userId: string,
    pendingConfirmations?: PendingAction[],
    channel?: string
  ): Promise<ChatResponse> {
    const { warnings, flags } = await this.verificationService.runAll(
      agentResponse,
      records,
      userId,
      channel
    );
    return {
      message: agentResponse,
      conversationId,
      toolCalls: records,
      pendingConfirmations: pendingConfirmations ?? [],
      warnings,
      flags
    };
  }

  /** Persist request-level observability metrics. Best-effort — never throws. */
  private _persistMetrics(
    conversationId: string,
    userId: string,
    requestStart: number,
    tokenAccumulator: TokenAccumulator,
    records: ToolCallRecord[],
    warnings: string[],
    flags: string[],
    channel?: string,
    langsmithRunId?: string
  ): void {
    try {
      const successCount = records.filter((r) => r.success).length;
      const metrics: RequestMetrics = {
        id: randomUUID(),
        userId,
        conversationId,
        requestedAt: new Date(requestStart).toISOString(),
        totalLatencyMs: Date.now() - requestStart,
        tokensIn: tokenAccumulator.tokensIn,
        tokensOut: tokenAccumulator.tokensOut,
        estimatedCostUsd: estimateCostUsd(
          this.modelName,
          tokenAccumulator.tokensIn,
          tokenAccumulator.tokensOut
        ),
        toolCallCount: records.length,
        toolSuccessCount: successCount,
        toolSuccessRate: records.length > 0 ? successCount / records.length : 1,
        verifierWarningCount: warnings.length,
        verifierFlagCount: flags.length,
        channel,
        langsmithRunId
      };
      this.metricsRepository.insert(metrics);
    } catch (err) {
      this.logger.warn(`Failed to persist metrics: ${err}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async chat(
    request: ChatRequest,
    userId: string,
    rawJwt: string,
    evalCaseId?: string
  ): Promise<ChatResponse> {
    const requestStart = Date.now();
    const tokenAccumulator = new TokenAccumulator();
    const conversationId = request.conversationId ?? randomUUID();
    const threadId = `${userId}:${conversationId}`;

    // LOCAL variable — never on `this` (cross-user data leak if class property)
    const records: ToolCallRecord[] = [];

    try {
      const { currency, language, aiPromptContext } =
        await this._loadUserContext(rawJwt);

      const systemPrompt = buildSystemPrompt(
        { userId, currency, language, aiPromptContext },
        ALL_TOOLS,
        request.channel
      );

      const hitlMatrix = await this.hitlMatrixService.getMatrix(userId);
      const autoApproveTools = this.hitlMatrixService.computeAutoApproveSet(
        hitlMatrix,
        this.toolRegistry.getAll()
      );

      const abortSignal = AbortSignal.timeout(30000);
      const toolContext: UserToolContext = {
        userId,
        abortSignal,
        auth: { mode: 'user', jwt: rawJwt },
        client: this.ghostfolioClient,
        autoApproveTools
      };

      const langchainTools = this._buildLangChainTools(toolContext, records);
      const agent = this._buildAgent(systemPrompt, langchainTools);

      const runId = randomUUID();
      const evalTags = evalCaseId ? ['eval', evalCaseId] : [];
      const evalMeta = evalCaseId ? { evalCaseId } : {};

      const result = await agent.invoke(
        { messages: [new HumanMessage(request.message)] },
        {
          configurable: { thread_id: threadId },
          callbacks: [tokenAccumulator],
          runId,
          runName: `chat:${conversationId.substring(0, 8)}`,
          tags: ['agent', request.channel ?? 'default', ...evalTags],
          metadata: {
            userId,
            conversationId,
            channel: request.channel,
            toolCount: langchainTools.length,
            ...evalMeta
          }
        }
      );

      // Detect interrupt (HITL) — unique to chat()
      if (isInterrupted(result)) {
        const interruptPayload = (result as Record<string | symbol, unknown>)[
          INTERRUPT
        ] as
          | {
              value: {
                toolName: string;
                proposedParams: unknown;
                description: string;
              };
            }[]
          | undefined;
        const payload = interruptPayload?.[0]?.value;

        if (payload) {
          const pendingAction: PendingAction = {
            id: randomUUID(),
            toolName: payload.toolName,
            category: 'write',
            proposedParams: payload.proposedParams,
            description: payload.description,
            status: 'pending',
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
          };
          await this.pendingActionsService.store(pendingAction, threadId);

          return {
            message: '',
            conversationId,
            toolCalls: records,
            pendingConfirmations: [pendingAction],
            warnings: [],
            flags: []
          };
        }
      }

      const agentResponse = this._extractLastMessage(result);
      const chatResponse = await this._buildVerifiedResponse(
        agentResponse,
        records,
        conversationId,
        userId,
        undefined,
        request.channel
      );
      this._persistMetrics(
        conversationId,
        userId,
        requestStart,
        tokenAccumulator,
        records,
        chatResponse.warnings,
        chatResponse.flags,
        request.channel,
        runId
      );
      return chatResponse;
    } catch (err) {
      this.logger.error(`chat() error for user ${userId}: ${err}`);
      return {
        message:
          'I encountered an error processing your request. Please try again.',
        conversationId,
        toolCalls: records,
        pendingConfirmations: [],
        warnings: [],
        flags: []
      };
    }
  }

  async resume(
    actionId: string,
    approved: boolean,
    userId: string,
    rawJwt: string
  ): Promise<ChatResponse> {
    const stored = await this.pendingActionsService.get(actionId);
    if (!stored) {
      throw new NotFoundException('Action not found or expired');
    }

    const { action, threadId } = stored;

    // Verify the action belongs to the requesting user
    if (threadId.split(':')[0] !== userId) {
      throw new ForbiddenException('Action does not belong to this user');
    }

    const conversationId = threadId.split(':').slice(1).join(':');
    const timestamp = new Date().toISOString();

    // Rejected branch — unique to resume()
    if (!approved) {
      await this.pendingActionsService.updateStatus(actionId, 'rejected');
      await this.auditService.log({
        id: randomUUID(),
        userId,
        action: 'write_rejected',
        toolName: action.toolName,
        params: action.proposedParams,
        timestamp
      });
      return {
        message: 'Action cancelled.',
        conversationId,
        toolCalls: [],
        pendingConfirmations: [],
        warnings: [],
        flags: []
      };
    }

    // Approved
    await this.pendingActionsService.updateStatus(actionId, 'approved');
    await this.auditService.log({
      id: randomUUID(),
      userId,
      action: 'write_approved',
      toolName: action.toolName,
      params: action.proposedParams,
      timestamp
    });

    // LOCAL variable — never on `this` (cross-user data leak if class property)
    const requestStart = Date.now();
    const tokenAccumulator = new TokenAccumulator();
    const records: ToolCallRecord[] = [];

    const hitlMatrix = await this.hitlMatrixService.getMatrix(userId);
    const autoApproveTools = this.hitlMatrixService.computeAutoApproveSet(
      hitlMatrix,
      this.toolRegistry.getAll()
    );

    const abortSignal = AbortSignal.timeout(30000);
    const toolContext: UserToolContext = {
      userId,
      abortSignal,
      auth: { mode: 'user', jwt: rawJwt },
      client: this.ghostfolioClient,
      autoApproveTools
    };

    try {
      const langchainTools = this._buildLangChainTools(toolContext, records);
      const { currency, language, aiPromptContext } =
        await this._loadUserContext(rawJwt);
      const systemPrompt = buildSystemPrompt(
        { userId, currency, language, aiPromptContext },
        ALL_TOOLS
      );
      const agent = this._buildAgent(systemPrompt, langchainTools);

      const runId = randomUUID();

      const result = await agent.invoke(
        new Command({ resume: action.proposedParams }),
        {
          configurable: { thread_id: threadId },
          callbacks: [tokenAccumulator],
          runId,
          runName: `resume:${conversationId.substring(0, 8)}`,
          tags: ['agent', 'resume'],
          metadata: {
            userId,
            conversationId,
            actionId,
            toolName: action.toolName
          }
        }
      );

      const agentResponse = this._extractLastMessage(result);
      const chatResponse = await this._buildVerifiedResponse(
        agentResponse,
        records,
        conversationId,
        userId
      );
      this._persistMetrics(
        conversationId,
        userId,
        requestStart,
        tokenAccumulator,
        records,
        chatResponse.warnings,
        chatResponse.flags,
        undefined,
        runId
      );
      return chatResponse;
    } catch (err) {
      this.logger.error(`resume() error for user ${userId}: ${err}`);
      return {
        message:
          'I encountered an error processing your request. Please try again.',
        conversationId,
        toolCalls: records,
        pendingConfirmations: [],
        warnings: [],
        flags: []
      };
    }
  }
}
