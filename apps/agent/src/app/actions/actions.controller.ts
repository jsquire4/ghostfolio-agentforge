import { Controller, Headers, Param, Post } from '@nestjs/common';

import { AgentService } from '../agent/agent.service';
import { ChatResponse } from '../common/interfaces';

@Controller('v1/actions')
export class ActionsController {
  constructor(private readonly agentService: AgentService) {}

  @Post(':id/approve')
  public async approve(
    @Param('id') id: string,
    @Headers('authorization') authHeader: string
  ): Promise<ChatResponse> {
    return this.agentService.resume(id, true, authHeader);
  }

  @Post(':id/reject')
  public async reject(
    @Param('id') id: string,
    @Headers('authorization') authHeader: string
  ): Promise<ChatResponse> {
    return this.agentService.resume(id, false, authHeader);
  }
}
