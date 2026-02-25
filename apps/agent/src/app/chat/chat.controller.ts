import { Body, Controller, Headers, Post } from '@nestjs/common';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength
} from 'class-validator';

import { AgentService } from '../agent/agent.service';
import { VALID_CHANNELS } from '../agent/channel.capabilities';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChatResponse } from '../common/interfaces';

export class ChatRequestDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(10000)
  message: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsString()
  @IsIn(VALID_CHANNELS)
  channel?: string;
}

@Controller('v1/chat')
export class ChatController {
  constructor(private readonly agentService: AgentService) {}

  @Post()
  public async chat(
    @Body() body: ChatRequestDto,
    @CurrentUser() user: AuthUser,
    @Headers('x-eval-case-id') evalCaseId?: string
  ): Promise<ChatResponse> {
    // Sanitize evalCaseId header to prevent injection
    const sanitizedEvalCaseId = evalCaseId
      ? evalCaseId.replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 100)
      : undefined;
    return this.agentService.chat(
      body,
      user.userId,
      user.rawJwt,
      sanitizedEvalCaseId
    );
  }
}
