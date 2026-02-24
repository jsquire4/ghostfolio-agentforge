import { Controller, Param, Post } from '@nestjs/common';

import { AgentService } from '../agent/agent.service';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChatResponse } from '../common/interfaces';

@Controller('v1/actions')
export class ActionsController {
  constructor(private readonly agentService: AgentService) {}

  @Post(':id/approve')
  public async approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser
  ): Promise<ChatResponse> {
    return this.agentService.resume(id, true, user.userId, user.rawJwt);
  }

  @Post(':id/reject')
  public async reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser
  ): Promise<ChatResponse> {
    return this.agentService.resume(id, false, user.userId, user.rawJwt);
  }
}
