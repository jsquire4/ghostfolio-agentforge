import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AgentService } from './agent.service';
import { PendingActionsService } from './pending-actions.service';

@Module({
  imports: [ConfigModule],
  providers: [AgentService, PendingActionsService],
  exports: [AgentService]
})
export class AgentModule {}
