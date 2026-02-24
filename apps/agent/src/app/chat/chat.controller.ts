import { Body, Controller, Headers, Post } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { AgentService } from '../agent/agent.service';
import { ChatResponse } from '../common/interfaces';

export class ChatRequestDto {
  @IsString()
  @MaxLength(10000)
  message: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}

@Controller('v1/chat')
export class ChatController {
  constructor(private readonly agentService: AgentService) {}

  @Post()
  public async chat(
    @Body() body: ChatRequestDto,
    @Headers('authorization') authHeader: string
  ): Promise<ChatResponse> {
    return this.agentService.chat(body, authHeader);
  }
}
