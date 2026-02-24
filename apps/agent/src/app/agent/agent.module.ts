import { Module } from '@nestjs/common';

import { AgentService } from './agent.service';
import { PendingActionsService } from './pending-actions.service';

@Module({
  providers: [AgentService, PendingActionsService],
  exports: [AgentService]
})
export class AgentModule {}
