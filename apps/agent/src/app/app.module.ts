import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

import { ActionsModule } from './actions/actions.module';
import { AuditModule } from './audit/audit.module';
import { ChatModule } from './chat/chat.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { JwtAuthExceptionFilter } from './common/jwt-auth.exception-filter';
import { DatabaseModule } from './database/database.module';
import { EvalsModule } from './evals/evals.module';
import { FeedbackModule } from './feedback/feedback.module';
import { GhostfolioModule } from './ghostfolio/ghostfolio.module';
import { HealthModule } from './health/health.module';
import { InsightsModule } from './insights/insights.module';
import { RedisModule } from './redis/redis.module';
import { ToolRegistryModule } from './tools/tool-registry.module';
import { ToolsModule } from './tools/tools.module';
import { VerificationModule } from './verification/verification.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    DatabaseModule,
    RedisModule,
    GhostfolioModule,
    AuditModule,
    ToolRegistryModule,
    VerificationModule,
    ActionsModule,
    ChatModule,
    EvalsModule,
    FeedbackModule,
    HealthModule,
    InsightsModule,
    ToolsModule
  ],
  providers: [
    { provide: APP_FILTER, useClass: JwtAuthExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard }
  ]
})
export class AppModule {}
