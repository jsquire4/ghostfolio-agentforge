import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query
} from '@nestjs/common';

import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InsightRecord } from '../common/interfaces';
import { InsightRepository } from '../database/insight.repository';

@Controller('v1/insights')
export class InsightsController {
  constructor(private readonly insightRepository: InsightRepository) {}

  @Get()
  public getInsights(
    @CurrentUser() user: AuthUser,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number
  ): InsightRecord[] {
    return this.insightRepository.getByUser(user.userId, limit, offset);
  }
}
