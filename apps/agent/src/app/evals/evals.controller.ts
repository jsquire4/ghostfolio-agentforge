import {
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query
} from '@nestjs/common';

import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EvalCaseResultRecord, EvalRunRecord } from '../common/storage.types';
import { EvalsRepository } from '../database/evals.repository';

@Controller('v1/evals')
export class EvalsController {
  constructor(private readonly evalsRepo: EvalsRepository) {}

  @Post('run')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public runEvals(@CurrentUser() _user: AuthUser): {
    message: string;
    status: string;
  } {
    return {
      message:
        'Eval execution is CLI-only. Use: npm run eval [golden|labeled|all]',
      status: 'not_supported'
    };
  }

  @Get('results')
  public getResults(
    @CurrentUser() _user: AuthUser,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number
  ): EvalRunRecord[] {
    return this.evalsRepo.getRecentRuns(limit, offset);
  }

  @Get('results/:runId')
  public getRunById(
    @CurrentUser() _user: AuthUser,
    @Param('runId') runId: string
  ): { run: EvalRunRecord; cases: EvalCaseResultRecord[] } {
    const result = this.evalsRepo.getRunById(runId);
    if (!result) {
      throw new NotFoundException(`Eval run '${runId}' not found`);
    }
    return result;
  }
}
