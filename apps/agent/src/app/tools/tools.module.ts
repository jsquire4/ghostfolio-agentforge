import { Module } from '@nestjs/common';

import { AgentModule } from '../agent/agent.module';
import { ToolsController } from './tools.controller';

@Module({
  imports: [AgentModule],
  controllers: [ToolsController]
})
export class ToolsModule {}
