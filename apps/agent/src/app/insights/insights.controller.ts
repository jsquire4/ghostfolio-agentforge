import { Controller, Get } from '@nestjs/common';

import { InsightRecord } from '../common/interfaces';

@Controller('v1/insights')
export class InsightsController {
  @Get()
  public getInsights(): InsightRecord[] {
    // TODO: Return persisted analysis results from SQLite insights store
    return [];
  }
}
