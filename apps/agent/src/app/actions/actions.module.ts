import { Module } from '@nestjs/common';

import { AgentModule } from '../agent/agent.module';
import { ActionsController } from './actions.controller';

@Module({
  imports: [AgentModule],
  controllers: [ActionsController]
})
export class ActionsModule {}
