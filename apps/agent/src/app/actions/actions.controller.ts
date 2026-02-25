import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put
} from '@nestjs/common';

import { AgentService } from '../agent/agent.service';
import { HitlMatrixService } from '../agent/hitl-matrix.service';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChatResponse, HitlMatrix } from '../common/interfaces';
import { SetHitlMatrixDto } from './hitl-matrix.dto';

@Controller('v1/actions')
export class ActionsController {
  constructor(
    private readonly agentService: AgentService,
    private readonly hitlMatrixService: HitlMatrixService
  ) {}

  @Post(':id/approve')
  public async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser
  ): Promise<ChatResponse> {
    return this.agentService.resume(id, true, user.userId, user.rawJwt);
  }

  @Post(':id/reject')
  public async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser
  ): Promise<ChatResponse> {
    return this.agentService.resume(id, false, user.userId, user.rawJwt);
  }

  @Get('hitl-matrix')
  public async getHitlMatrix(
    @CurrentUser() user: AuthUser
  ): Promise<HitlMatrix> {
    return this.hitlMatrixService.getMatrix(user.userId);
  }

  @Put('hitl-matrix')
  public async setHitlMatrix(
    @Body() matrix: SetHitlMatrixDto,
    @CurrentUser() user: AuthUser
  ): Promise<{ ok: true }> {
    await this.hitlMatrixService.setMatrix(
      user.userId,
      matrix as unknown as HitlMatrix
    );
    return { ok: true };
  }
}
