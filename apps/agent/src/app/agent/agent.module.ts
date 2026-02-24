import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { AuditService } from '../audit/audit.service';
import { GhostfolioModule } from '../ghostfolio/ghostfolio.module';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { VerificationService } from '../verification/verification.service';
import { AgentService } from './agent.service';
import { PendingActionsService } from './pending-actions.service';

@Module({
  imports: [ConfigModule, GhostfolioModule],
  providers: [
    AgentService,
    ToolRegistryService,
    VerificationService,
    PendingActionsService,
    AuditService,
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD'),
          lazyConnect: true
        })
    }
  ],
  exports: [AgentService, ToolRegistryService]
})
export class AgentModule {}
