import { Body, Controller, Post } from '@nestjs/common';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength
} from 'class-validator';

import { AgentService } from '../agent/agent.service';
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
}

@Controller('v1/chat')
export class ChatController {
  constructor(private readonly agentService: AgentService) {}

  @Post()
  public async chat(
    @Body() body: ChatRequestDto,
    @CurrentUser() user: AuthUser
  ): Promise<ChatResponse> {
    return this.agentService.chat(body, user.userId, user.rawJwt);
  }
}
