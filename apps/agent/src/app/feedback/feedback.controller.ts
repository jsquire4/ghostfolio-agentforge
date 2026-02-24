import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { randomUUID } from 'crypto';

import { extractUserId } from '../common/jwt.util';
import { FeedbackRepository } from '../database/feedback.repository';

export class FeedbackDto {
  @IsIn(['up', 'down'])
  rating: 'up' | 'down';

  @IsOptional()
  @IsString()
  correction?: string;
}

@Controller('v1/chat')
export class FeedbackController {
  constructor(private readonly feedbackRepository: FeedbackRepository) {}

  @Post(':conversationId/feedback')
  public submitFeedback(
    @Param('conversationId') conversationId: string,
    @Body() body: FeedbackDto,
    @Headers('authorization') authHeader: string
  ): { ok: true } {
    const { userId } = extractUserId(authHeader);
    this.feedbackRepository.log({
      id: randomUUID(),
      userId,
      conversationId,
      rating: body.rating,
      correction: body.correction,
      createdAt: new Date().toISOString()
    });
    return { ok: true };
  }
}
