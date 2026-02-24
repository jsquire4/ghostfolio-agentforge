import { HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
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
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

import { AuditService } from '../audit/audit.service';
import {
  ChatRequest,
  ChatResponse,
  PendingAction,
  ToolCallRecord,
  ToolDeps,
  UserToolContext
} from '../common/interfaces';
import { extractUserId } from '../common/jwt.util';
import { GhostfolioClientService } from '../ghostfolio/ghostfolio-client.service';
import { getToolManifest } from '../tools/tool-manifest';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { VerificationService } from '../verification/verification.service';
import { PendingActionsService } from './pending-actions.service';
import { RedisCheckpointSaver } from './redis-checkpoint.saver';
import { buildSystemPrompt } from './system-prompt.builder';

@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);
  private checkpointSaver!: RedisCheckpointSaver;
  private llm!: ChatOpenAI;

  constructor(
    private readonly ghostfolioClient: GhostfolioClientService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly verificationService: VerificationService,
    private readonly pendingActionsService: PendingActionsService,
    private readonly auditService: AuditService,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis
  ) {
  }

  onModuleInit(): void {
    this.checkpointSaver = new RedisCheckpointSaver(this.redisClient);
    this.llm = new ChatOpenAI({
      model: 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 2048,
      timeout: 30000
    });

    // Register all tools from the manifest
    const deps: ToolDeps = { client: this.ghostfolioClient };
    getToolManifest(deps).forEach((t) => this.toolRegistry.register(t));

    this.logger.log(
      'AgentService initialized — tools registered, LLM configured'
    );
  }

  async chat(request: ChatRequest, authHeader: string): Promise<ChatResponse> {
    const { userId, rawJwt } = extractUserId(authHeader);
    const conversationId = request.conversationId ?? randomUUID();
    const threadId = `${userId}:${conversationId}`;

    // LOCAL variable — never on `this` (cross-user data leak if class property)
    const records: ToolCallRecord[] = [];

    try {
      // Load user context (failures produce empty context)
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

      const systemPrompt = buildSystemPrompt({
        userId,
        currency,
        language,
        aiPromptContext
      });

      const abortSignal = AbortSignal.timeout(30000);
      const toolContext: UserToolContext = {
        userId,
        abortSignal,
        auth: { mode: 'user', jwt: rawJwt }
      };

      // Wrap tools to record calls
      const langchainTools = this.toolRegistry.getAll().map((def) => {
        return tool(
          async (params: unknown) => {
            const start = Date.now();
            const result = await def.execute(params, toolContext);
            let success = true;
            try {
              success = !(JSON.parse(result) as { error?: string }).error;
            } catch {
              // non-JSON result is still success
            }
            records.push({
              toolName: def.name,
              params,
              result,
              calledAt: new Date().toISOString(),
              durationMs: Date.now() - start,
              success
            });
            return result;
          },
          {
            name: def.name,
            description: def.description,
            schema: def.schema
          }
        );
      });

      // Build agent fresh each call — tools close over per-request JWT
      const agent = createReactAgent({
        llm: this.llm,
        tools: langchainTools,
        prompt: systemPrompt,
        checkpointSaver: this.checkpointSaver
      });

      const result = await agent.invoke(
        { messages: [new HumanMessage(request.message)] },
        { configurable: { thread_id: threadId } }
      );

      // Detect interrupt (HITL)
      if (isInterrupted(result)) {
        const interruptPayload = (result as any)[INTERRUPT]?.[0]?.value as
          | {
              toolName: string;
              proposedParams: unknown;
              description: string;
            }
          | undefined;

        if (interruptPayload) {
          const pendingAction: PendingAction = {
            id: randomUUID(),
            toolName: interruptPayload.toolName,
            category: 'write',
            proposedParams: interruptPayload.proposedParams,
            description: interruptPayload.description,
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

      // Extract last AI message
      const messages = result.messages ?? [];
      const lastMessage = messages[messages.length - 1];
      const agentResponse =
        typeof lastMessage?.content === 'string'
          ? lastMessage.content
          : JSON.stringify(lastMessage?.content ?? '');

      // Run verification
      const { warnings, flags } = await this.verificationService.runAll(
        agentResponse,
        records,
        userId
      );

      return {
        message: agentResponse,
        conversationId,
        toolCalls: records,
        pendingConfirmations: [],
        warnings,
        flags
      };
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
    authHeader: string
  ): Promise<ChatResponse> {
    const { userId, rawJwt } = extractUserId(authHeader);

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
    const records: ToolCallRecord[] = [];
    const abortSignal = AbortSignal.timeout(30000);
    const toolContext: UserToolContext = {
      userId,
      abortSignal,
      auth: { mode: 'user', jwt: rawJwt }
    };

    try {
      const langchainTools = this.toolRegistry.getAll().map((def) => {
        return tool(
          async (params: unknown) => {
            const start = Date.now();
            const result = await def.execute(params, toolContext);
            let success = true;
            try {
              success = !(JSON.parse(result) as { error?: string }).error;
            } catch {
              // non-JSON result is still success
            }
            records.push({
              toolName: def.name,
              params,
              result,
              calledAt: new Date().toISOString(),
              durationMs: Date.now() - start,
              success
            });
            return result;
          },
          {
            name: def.name,
            description: def.description,
            schema: def.schema
          }
        );
      });

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

      const systemPrompt = buildSystemPrompt({
        userId,
        currency,
        language,
        aiPromptContext
      });

      const agent = createReactAgent({
        llm: this.llm,
        tools: langchainTools,
        prompt: systemPrompt,
        checkpointSaver: this.checkpointSaver
      });

      const result = await agent.invoke(
        new Command({ resume: action.proposedParams }),
        { configurable: { thread_id: threadId } }
      );

      const messages = result.messages ?? [];
      const lastMessage = messages[messages.length - 1];
      const agentResponse =
        typeof lastMessage?.content === 'string'
          ? lastMessage.content
          : JSON.stringify(lastMessage?.content ?? '');

      const { warnings, flags } = await this.verificationService.runAll(
        agentResponse,
        records,
        userId
      );

      return {
        message: agentResponse,
        conversationId,
        toolCalls: records,
        pendingConfirmations: [],
        warnings,
        flags
      };
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
