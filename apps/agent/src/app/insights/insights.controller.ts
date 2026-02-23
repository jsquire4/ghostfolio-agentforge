import { Controller, Get } from '@nestjs/common';

export interface Insight {
  category: string;
  generatedAt: string;
  id: string;
  summary: string;
}

@Controller('v1/insights')
export class InsightsController {
  @Get()
  public getInsights(): Insight[] {
    // TODO: Return persisted analysis results from SQLite insights store
    return [];
  }
}
