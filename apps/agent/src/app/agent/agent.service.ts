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
import { ToolMetricsRecord } from '../common/storage.types';
import { InsightRepository } from '../database/insight.repository';
import { MetricsRepository } from '../database/metrics.repository';
import { ToolMetricsRepository } from '../database/tool-metrics.repository';
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_TIMEOUT_MS = 30_000;
const MAX_TOKENS = 2048;
const TEMPERATURE = 0;
const HITL_EXPIRY_MS = 15 * 60 * 1000;
const DEFAULT_MODEL = 'gpt-4o-mini';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

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

interface MetricsParams {
  conversationId: string;
  userId: string;
  requestStart: number;
  tokenAccumulator: TokenAccumulator;
  records: ToolCallRecord[];
  warnings: string[];
  flags: string[];
  channel?: string;
  langsmithRunId?: string;
}

interface AgentRequestParams {
  userId: string;
  rawJwt: string;
  conversationId: string;
  threadId: string;
  channel?: string;
  message?: string;
  resumeCommand?: unknown;
  evalCaseId?: string;
  actionId?: string;
  toolName?: string;
}

interface AgentRequestResult {
  agentResult: unknown;
  records: ToolCallRecord[];
  tokenAccumulator: TokenAccumulator;
  runId: string;
  requestStart: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

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
    private readonly insightRepository: InsightRepository,
    private readonly metricsRepository: MetricsRepository,
    private readonly toolMetricsRepository: ToolMetricsRepository,
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
    this.modelName = DEFAULT_MODEL;
    this.llm = new ChatOpenAI({
      model: this.modelName,
      temperature: TEMPERATURE,
      maxTokens: MAX_TOKENS,
      timeout: AGENT_TIMEOUT_MS
    });

    ALL_TOOLS.forEach((t) => this.toolRegistry.register(t));

    this.logger.log(
      'AgentService initialized — tools registered, LLM configured'
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

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

  private _buildToolContext(
    userId: string,
    abortSignal: AbortSignal,
    rawJwt: string,
    autoApproveTools: Set<string>
  ): UserToolContext {
    return {
      userId,
      abortSignal,
      auth: { mode: 'user', jwt: rawJwt },
      client: this.ghostfolioClient,
      autoApproveTools
    };
  }

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

  private _extractLastMessage(result: unknown): string {
    const messages = (result as { messages?: unknown[] }).messages ?? [];
    const lastMessage = messages[messages.length - 1] as
      | { content?: unknown }
      | undefined;
    return typeof lastMessage?.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage?.content ?? '');
  }

  private async _buildVerifiedResponse(
    agentResponse: string,
    records: ToolCallRecord[],
    conversationId: string,
    userId: string,
    pendingConfirmations?: PendingAction[],
    channel?: string
  ): Promise<ChatResponse> {
    const { warnings, flags, insightData } =
      await this.verificationService.runAll(
        agentResponse,
        records,
        userId,
        channel
      );

    if (insightData) {
      try {
        this.insightRepository.insert({
          id: randomUUID(),
          userId,
          ...insightData,
          createdAt: new Date().toISOString()
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to persist insight record: ${msg}`);
      }
    }

    return {
      message: agentResponse,
      conversationId,
      toolCalls: records,
      pendingConfirmations: pendingConfirmations ?? [],
      warnings,
      flags
    };
  }

  private _persistMetrics(params: MetricsParams): void {
    try {
      const successCount = params.records.filter((r) => r.success).length;
      const metrics: RequestMetrics = {
        id: randomUUID(),
        userId: params.userId,
        conversationId: params.conversationId,
        requestedAt: new Date(params.requestStart).toISOString(),
        totalLatencyMs: Date.now() - params.requestStart,
        tokensIn: params.tokenAccumulator.tokensIn,
        tokensOut: params.tokenAccumulator.tokensOut,
        estimatedCostUsd: estimateCostUsd(
          this.modelName,
          params.tokenAccumulator.tokensIn,
          params.tokenAccumulator.tokensOut
        ),
        toolCallCount: params.records.length,
        toolSuccessCount: successCount,
        toolSuccessRate:
          params.records.length > 0 ? successCount / params.records.length : 1,
        verifierWarningCount: params.warnings.length,
        verifierFlagCount: params.flags.length,
        channel: params.channel,
        langsmithRunId: params.langsmithRunId
      };
      this.metricsRepository.insert(metrics);

      if (params.records.length > 0) {
        const toolMetrics: ToolMetricsRecord[] = params.records.map((r) => {
          let error: string | undefined;
          try {
            const parsed = JSON.parse(r.result);
            if (parsed.error) error = String(parsed.error);
          } catch {
            // result not parseable — skip error extraction
          }
          return {
            id: randomUUID(),
            requestMetricsId: metrics.id,
            toolName: r.toolName,
            calledAt: r.calledAt,
            durationMs: r.durationMs,
            success: r.success,
            error
          };
        });
        this.toolMetricsRepository.insertMany(toolMetrics);
      }
    } catch (err) {
      this.logger.warn(`Failed to persist metrics: ${err}`);
    }
  }

  private async _runAgentRequest(
    params: AgentRequestParams
  ): Promise<AgentRequestResult> {
    const requestStart = Date.now();
    const tokenAccumulator = new TokenAccumulator();
    const records: ToolCallRecord[] = [];

    const { currency, language, aiPromptContext } = await this._loadUserContext(
      params.rawJwt
    );

    const systemPrompt = buildSystemPrompt(
      {
        userId: params.userId,
        currency,
        language,
        aiPromptContext
      },
      ALL_TOOLS,
      params.channel
    );

    const hitlMatrix = await this.hitlMatrixService.getMatrix(params.userId);
    const autoApproveTools = this.hitlMatrixService.computeAutoApproveSet(
      hitlMatrix,
      this.toolRegistry.getAll()
    );

    const toolContext = this._buildToolContext(
      params.userId,
      AbortSignal.timeout(AGENT_TIMEOUT_MS),
      params.rawJwt,
      autoApproveTools
    );

    const langchainTools = this._buildLangChainTools(toolContext, records);
    const agent = this._buildAgent(systemPrompt, langchainTools);

    const runId = randomUUID();
    const evalTags = params.evalCaseId ? ['eval', params.evalCaseId] : [];
    const evalMeta = params.evalCaseId ? { evalCaseId: params.evalCaseId } : {};

    const invokeInput = params.resumeCommand
      ? new Command({ resume: params.resumeCommand })
      : { messages: [new HumanMessage(params.message!)] };

    const invokeConfig = params.resumeCommand
      ? {
          configurable: { thread_id: params.threadId },
          callbacks: [tokenAccumulator],
          runId,
          runName: `resume:${params.conversationId.substring(0, 8)}`,
          tags: ['agent', 'resume'],
          metadata: {
            userId: params.userId,
            conversationId: params.conversationId,
            actionId: params.actionId,
            toolName: params.toolName,
            ...evalMeta
          }
        }
      : {
          configurable: { thread_id: params.threadId },
          callbacks: [tokenAccumulator],
          runId,
          runName: `chat:${params.conversationId.substring(0, 8)}`,
          tags: ['agent', params.channel ?? 'default', ...evalTags],
          metadata: {
            userId: params.userId,
            conversationId: params.conversationId,
            channel: params.channel,
            toolCount: langchainTools.length,
            ...evalMeta
          }
        };

    const agentResult = await agent.invoke(invokeInput, invokeConfig);

    return { agentResult, records, tokenAccumulator, runId, requestStart };
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
    const conversationId = request.conversationId ?? randomUUID();
    const threadId = `${userId}:${conversationId}`;
    let runId: string | undefined;
    let requestStart = Date.now();
    let tokenAccumulator = new TokenAccumulator();
    let records: ToolCallRecord[] = [];

    try {
      const result = await this._runAgentRequest({
        userId,
        rawJwt,
        conversationId,
        threadId,
        channel: request.channel,
        message: request.message,
        evalCaseId
      });

      runId = result.runId;
      requestStart = result.requestStart;
      tokenAccumulator = result.tokenAccumulator;
      records = result.records;

      // Detect interrupt (HITL) — unique to chat()
      if (isInterrupted(result.agentResult)) {
        const interruptPayload = (
          result.agentResult as Record<string | symbol, unknown>
        )[INTERRUPT] as
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
            expiresAt: new Date(Date.now() + HITL_EXPIRY_MS).toISOString()
          };
          await this.pendingActionsService.store(pendingAction, threadId);

          this._persistMetrics({
            conversationId,
            userId,
            requestStart,
            tokenAccumulator,
            records,
            warnings: [],
            flags: [],
            channel: request.channel,
            langsmithRunId: runId
          });

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

      const agentResponse = this._extractLastMessage(result.agentResult);
      const chatResponse = await this._buildVerifiedResponse(
        agentResponse,
        records,
        conversationId,
        userId,
        undefined,
        request.channel
      );
      this._persistMetrics({
        conversationId,
        userId,
        requestStart,
        tokenAccumulator,
        records,
        warnings: chatResponse.warnings,
        flags: chatResponse.flags,
        channel: request.channel,
        langsmithRunId: runId
      });
      return chatResponse;
    } catch (err) {
      this.logger.error(`chat() error for user ${userId}: ${err}`);
      this._persistMetrics({
        conversationId,
        userId,
        requestStart,
        tokenAccumulator,
        records,
        warnings: [],
        flags: [],
        channel: request.channel,
        langsmithRunId: runId
      });
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

    if (threadId.split(':')[0] !== userId) {
      throw new ForbiddenException('Action does not belong to this user');
    }

    const conversationId = threadId.split(':').slice(1).join(':');
    const timestamp = new Date().toISOString();

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
      this._persistMetrics({
        conversationId,
        userId,
        requestStart: Date.now(),
        tokenAccumulator: new TokenAccumulator(),
        records: [],
        warnings: [],
        flags: []
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

    await this.pendingActionsService.updateStatus(actionId, 'approved');
    await this.auditService.log({
      id: randomUUID(),
      userId,
      action: 'write_approved',
      toolName: action.toolName,
      params: action.proposedParams,
      timestamp
    });

    let runId: string | undefined;
    let requestStart = Date.now();
    let tokenAccumulator = new TokenAccumulator();
    let records: ToolCallRecord[] = [];

    try {
      const result = await this._runAgentRequest({
        userId,
        rawJwt,
        conversationId,
        threadId,
        resumeCommand: action.proposedParams,
        actionId,
        toolName: action.toolName
      });

      runId = result.runId;
      requestStart = result.requestStart;
      tokenAccumulator = result.tokenAccumulator;
      records = result.records;

      const agentResponse = this._extractLastMessage(result.agentResult);
      const chatResponse = await this._buildVerifiedResponse(
        agentResponse,
        records,
        conversationId,
        userId
      );
      this._persistMetrics({
        conversationId,
        userId,
        requestStart,
        tokenAccumulator,
        records,
        warnings: chatResponse.warnings,
        flags: chatResponse.flags,
        langsmithRunId: runId
      });
      return chatResponse;
    } catch (err) {
      this.logger.error(`resume() error for user ${userId}: ${err}`);
      this._persistMetrics({
        conversationId,
        userId,
        requestStart,
        tokenAccumulator,
        records,
        warnings: [],
        flags: [],
        langsmithRunId: runId
      });
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
