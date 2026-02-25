import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

import { makeChatResponse } from '../../../test-fixtures';
import { validAuthHeader } from '../../../test-fixtures/jwt.fixture';
import { ActionsController } from '../../actions/actions.controller';
import { AgentService } from '../../agent/agent.service';
import { HitlMatrixService } from '../../agent/hitl-matrix.service';
import { ChatController } from '../../chat/chat.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtAuthExceptionFilter } from '../../common/jwt-auth.exception-filter';
import { DatabaseModule } from '../../database/database.module';
import { FeedbackModule } from '../../feedback/feedback.module';
import { GhostfolioClientService } from '../../ghostfolio/ghostfolio-client.service';
import { GhostfolioModule } from '../../ghostfolio/ghostfolio.module';
import { HealthModule } from '../../health/health.module';
import { InsightsModule } from '../../insights/insights.module';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { RedisModule } from '../../redis/redis.module';
import { ALL_TOOLS } from '../../tools/index';
import { ToolRegistryModule } from '../../tools/tool-registry.module';
import { ToolRegistryService } from '../../tools/tool-registry.service';
import { ToolsController } from '../../tools/tools.controller';

// Mock AgentService's transitive LangChain imports to avoid TS2589
jest.mock('../../agent/agent.service', () => ({
  AgentService: jest.fn()
}));

// Integration test module — includes Chat/Actions controllers with a mock AgentService
@Module({
  imports: [
    ConfigModule.forRoot(),
    DatabaseModule,
    RedisModule,
    GhostfolioModule,
    ToolRegistryModule,
    FeedbackModule,
    HealthModule,
    InsightsModule
  ],
  controllers: [ToolsController, ChatController, ActionsController],
  providers: [
    { provide: APP_FILTER, useClass: JwtAuthExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: AgentService, useValue: {} }, // overridden in test setup
    {
      provide: HitlMatrixService,
      useValue: {
        getMatrix: jest.fn(),
        setMatrix: jest.fn(),
        computeAutoApproveSet: jest.fn()
      }
    }
  ]
})
class IntegrationTestModule {}

describe('Agent API (integration)', () => {
  let app: INestApplication;
  let tmpDir: string;

  const mockAgentService = {
    chat: jest
      .fn()
      .mockResolvedValue(makeChatResponse({ message: 'Mock response' })),
    resume: jest
      .fn()
      .mockResolvedValue(makeChatResponse({ message: 'Action processed' }))
  };

  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    hgetall: jest.fn(),
    hget: jest.fn(),
    hset: jest.fn(),
    pipeline: jest.fn().mockReturnValue({
      hset: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        [null, 'OK'],
        [null, 1]
      ])
    })
  };

  const mockCache = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined)
  };

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agent-integration-'));
    const configOverrides: Record<string, string> = {
      OPENAI_API_KEY: 'test-key',
      GHOSTFOLIO_API_TOKEN: 'test-token',
      AGENT_DB_PATH: join(tmpDir, 'insights.db'),
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379'
    };

    const module = await Test.createTestingModule({
      imports: [IntegrationTestModule]
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn((key: string, def?: string) => configOverrides[key] ?? def)
      })
      .overrideProvider(REDIS_CLIENT)
      .useValue(mockRedis)
      .overrideProvider(CACHE_MANAGER)
      .useValue(mockCache)
      .overrideProvider(GhostfolioClientService)
      .useValue({
        get: jest.fn().mockResolvedValue({}),
        post: jest.fn().mockResolvedValue({})
      })
      .overrideProvider(AgentService)
      .useValue(mockAgentService)
      .compile();

    // Register tools manually (normally done by AgentService in production)
    const registry = module.get(ToolRegistryService);
    ALL_TOOLS.forEach((t) => registry.register(t));

    app = module.createNestApplication();
    app.enableCors();
    app.setGlobalPrefix('api', { exclude: ['api/v1/health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true
      })
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('GET /api/v1/health', () => {
    it('returns ok without auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(res.body).toMatchObject({ status: 'ok' });
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/v1/tools', () => {
    it('returns tool list without auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tools')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((t: any) => t.name === 'portfolio_summary')).toBe(
        true
      );
    });
  });

  describe('GET /api/v1/insights', () => {
    it('returns 401 without auth', async () => {
      await request(app.getHttpServer()).get('/api/v1/insights').expect(401);
    });

    it('returns insights with valid JWT', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/insights')
        .set('Authorization', validAuthHeader)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/v1/chat/:id/feedback', () => {
    it('returns 401 without auth', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/chat/conv-123/feedback')
        .send({ rating: 'up' })
        .expect(401);
    });

    it('accepts feedback with valid JWT', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/chat/conv-123/feedback')
        .set('Authorization', validAuthHeader)
        .send({ rating: 'up' })
        .expect(201);

      expect(res.body).toEqual({ ok: true });
    });
  });

  describe('POST /api/v1/chat', () => {
    it('returns 200 with valid auth', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/chat')
        .set('Authorization', validAuthHeader)
        .send({ message: 'Hello' })
        .expect(201);

      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('conversationId');
      expect(res.body).toHaveProperty('toolCalls');
      expect(res.body).toHaveProperty('warnings');
      expect(res.body).toHaveProperty('flags');
    });

    it('returns 401 without auth', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/chat')
        .send({ message: 'Hello' })
        .expect(401);
    });

    it('returns 400 for malformed body (missing message)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/chat')
        .set('Authorization', validAuthHeader)
        .send({})
        .expect(400);
    });
  });

  describe('POST /api/v1/actions/:id', () => {
    it('approve returns 201 with valid auth', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/actions/action-123/approve')
        .set('Authorization', validAuthHeader)
        .expect(201);

      expect(res.body).toHaveProperty('message');
      expect(mockAgentService.resume).toHaveBeenCalledWith(
        'action-123',
        true,
        expect.any(String),
        expect.any(String)
      );
    });

    it('reject returns 201 with valid auth', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/actions/action-456/reject')
        .set('Authorization', validAuthHeader)
        .expect(201);

      expect(res.body).toHaveProperty('message');
      expect(mockAgentService.resume).toHaveBeenCalledWith(
        'action-456',
        false,
        expect.any(String),
        expect.any(String)
      );
    });
  });

  describe('GET /api/v1/tools (response shape)', () => {
    it('each tool has name, description, parameters, category, requiresConfirmation', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tools')
        .expect(200);

      expect(res.body.length).toBeGreaterThan(0);
      for (const tool of res.body) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('parameters');
        expect(tool).toHaveProperty('category');
        expect(tool).toHaveProperty('requiresConfirmation');
      }
    });
  });
});
