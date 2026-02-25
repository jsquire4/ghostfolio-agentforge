import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { randomUUID } from 'crypto';

import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FeedbackRepository } from '../database/feedback.repository';

export class FeedbackDto {
  @IsIn(['up', 'down'])
  rating: 'up' | 'down';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  correction?: string;
}

@Controller('v1/chat')
export class FeedbackController {
  constructor(private readonly feedbackRepository: FeedbackRepository) {}

  @Post(':conversationId/feedback')
  public submitFeedback(
    @Param('conversationId') conversationId: string,
    @Body() body: FeedbackDto,
    @CurrentUser() user: AuthUser
  ): { ok: true } {
    // conversationId is user-provided (currently = userId). Cap length and sanitize.
    if (
      !conversationId ||
      conversationId.length > 100 ||
      !/^[\w-]+$/.test(conversationId)
    ) {
      throw new BadRequestException('Invalid conversationId');
    }

    this.feedbackRepository.log({
      id: randomUUID(),
      userId: user.userId,
      conversationId,
      rating: body.rating,
      correction: body.correction,
      createdAt: new Date().toISOString()
    });
    return { ok: true };
  }
}
