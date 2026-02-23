import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ChatModule } from './chat/chat.module';
import { DatabaseModule } from './database/database.module';
import { EvalsModule } from './evals/evals.module';
import { HealthModule } from './health/health.module';
import { InsightsModule } from './insights/insights.module';
import { RedisModule } from './redis/redis.module';
import { ToolsModule } from './tools/tools.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    DatabaseModule,
    RedisModule,
    ChatModule,
    EvalsModule,
    HealthModule,
    InsightsModule,
    ToolsModule
  ]
})
export class AppModule {}
