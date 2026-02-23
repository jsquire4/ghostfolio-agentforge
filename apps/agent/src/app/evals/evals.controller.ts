import { Controller, Get, Post } from '@nestjs/common';

export interface EvalResult {
  passRate: number;
  runId: string;
  scores: Record<string, number>;
  timestamp: string;
  totalCases: number;
}

@Controller('v1/evals')
export class EvalsController {
  @Post('run')
  public runEvals(): { runId: string; status: string } {
    // TODO: Trigger eval suite against LangSmith
    return {
      runId: 'stub',
      status: 'queued'
    };
  }

  @Get('results')
  public getResults(): EvalResult[] {
    // TODO: Return historical eval results
    return [];
  }
}
