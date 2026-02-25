import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AgentService } from './agent.service';
import { HitlMatrixService } from './hitl-matrix.service';
import { PendingActionsService } from './pending-actions.service';

@Module({
  imports: [ConfigModule],
  providers: [AgentService, HitlMatrixService, PendingActionsService],
  exports: [AgentService, HitlMatrixService]
})
export class AgentModule {}
