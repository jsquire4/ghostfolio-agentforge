import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';

import { ActionsModule } from './actions/actions.module';
import { ChatModule } from './chat/chat.module';
import { JwtAuthExceptionFilter } from './common/jwt-auth.exception-filter';
import { DatabaseModule } from './database/database.module';
import { EvalsModule } from './evals/evals.module';
import { FeedbackModule } from './feedback/feedback.module';
import { GhostfolioModule } from './ghostfolio/ghostfolio.module';
import { HealthModule } from './health/health.module';
import { InsightsModule } from './insights/insights.module';
import { RedisModule } from './redis/redis.module';
import { ToolsModule } from './tools/tools.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    DatabaseModule,
    RedisModule,
    GhostfolioModule,
    ActionsModule,
    ChatModule,
    EvalsModule,
    FeedbackModule,
    HealthModule,
    InsightsModule,
    ToolsModule
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: JwtAuthExceptionFilter
    }
  ]
})
export class AppModule {}
