import { Body, Controller, Post } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';

export class ChatRequestDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}

@Controller('v1/chat')
export class ChatController {
  @Post()
  public chat(@Body() body: ChatRequestDto): {
    message: string;
    conversationId: string;
  } {
    // TODO: Wire up LangChain agent
    const conversationId = body.conversationId ?? 'stub';

    return {
      conversationId,
      message: `Echo [${conversationId.slice(0, 8)}]: "${body.message}"`
    };
  }
}
