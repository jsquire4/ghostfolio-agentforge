import { Controller, Get, Post } from '@nestjs/common';

import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public runEvals(@CurrentUser() user: AuthUser): {
    runId: string;
    status: string;
  } {
    // TODO: Trigger eval suite against LangSmith
    return {
      runId: 'stub',
      status: 'queued'
    };
  }

  @Get('results')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public getResults(@CurrentUser() user: AuthUser): EvalResult[] {
    // TODO: Return historical eval results
    return [];
  }
}
