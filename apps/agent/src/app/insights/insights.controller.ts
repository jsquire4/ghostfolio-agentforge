import { Controller, Get, Headers } from '@nestjs/common';

import { InsightRecord } from '../common/interfaces';
import { extractUserId } from '../common/jwt.util';
import { InsightRepository } from '../database/insight.repository';

@Controller('v1/insights')
export class InsightsController {
  constructor(private readonly insightRepository: InsightRepository) {}

  @Get()
  public getInsights(
    @Headers('authorization') authHeader: string
  ): InsightRecord[] {
    const { userId } = extractUserId(authHeader);
    return this.insightRepository.getByUser(userId);
  }
}
