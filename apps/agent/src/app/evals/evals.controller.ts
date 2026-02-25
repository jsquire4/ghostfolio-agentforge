import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  Sse
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Response } from 'express';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { map, Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EvalCaseResultRecord, EvalRunRecord } from '../common/storage.types';
import { EvalsRepository } from '../database/evals.repository';
import { EvalRunnerService } from './eval-runner.service';
import { EvalSseEvent } from './eval-sse.types';

export class RunEvalsDto {
  @IsOptional()
  @IsIn(['golden', 'labeled', 'all'])
  tier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tool?: string;
}

@Controller('v1/evals')
export class EvalsController {
  constructor(
    private readonly evalsRepo: EvalsRepository,
    private readonly evalRunner: EvalRunnerService
  ) {}

  @Post('run')
  public runEvals(
    @CurrentUser() _user: AuthUser,
    @Body() dto: RunEvalsDto
  ): { runId: string; status: string } {
    return this.evalRunner.startRun(dto.tier ?? 'all', dto.tool);
  }

  @Sse('stream')
  public streamEvents(): Observable<MessageEvent> {
    const stream = this.evalRunner.getEventStream();
    return stream.pipe(
      map(
        (event: EvalSseEvent) =>
          ({
            data: event
          }) as MessageEvent
      ),
      finalize(() => this.evalRunner.releaseSubscriber())
    );
  }

  @Get('status')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public getStatus(@CurrentUser() _user: AuthUser) {
    return this.evalRunner.getStatus();
  }

  @Get('results')
  public getResults(
    @CurrentUser() _user: AuthUser,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number
  ): EvalRunRecord[] {
    return this.evalsRepo.getRecentRuns(Math.min(limit, 100), offset);
  }

  @Get('reports/:filename')
  public getReport(@Param('filename') filename: string, @Res() res: Response) {
    // Sanitize: only allow alphanumeric, hyphens, underscores, dots
    if (!/^[\w\-.]+\.html$/.test(filename)) {
      throw new BadRequestException('Invalid report filename');
    }
    const filePath = resolve(process.cwd(), 'evals/reports', filename);
    if (!existsSync(filePath)) {
      throw new NotFoundException('Report not found');
    }
    res.sendFile(filePath);
  }

  @Get('results/:runId')
  public getRunById(
    @CurrentUser() _user: AuthUser,
    @Param('runId', ParseUUIDPipe) runId: string
  ): { run: EvalRunRecord; cases: EvalCaseResultRecord[] } {
    const result = this.evalsRepo.getRunById(runId);
    if (!result) {
      throw new NotFoundException(`Eval run '${runId}' not found`);
    }
    return result;
  }
}
