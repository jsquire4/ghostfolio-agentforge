import { Controller, Get, Param, Query } from '@nestjs/common';

import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestMetrics } from '../common/interfaces';
import { ToolMetricsRecord } from '../common/storage.types';
import {
  AggregateMetrics,
  MetricsRepository
} from '../database/metrics.repository';
import {
  ToolMetricsRepository,
  ToolSummary
} from '../database/tool-metrics.repository';

@Controller('v1/metrics')
export class MetricsController {
  constructor(
    private readonly metricsRepository: MetricsRepository,
    private readonly toolMetricsRepository: ToolMetricsRepository
  ) {}

  @Get()
  public getMetrics(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ): RequestMetrics[] {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    return this.metricsRepository.getByUser(
      user.userId,
      isNaN(parsedLimit) ? 50 : parsedLimit,
      isNaN(parsedOffset) ? 0 : parsedOffset
    );
  }

  @Get('summary')
  public getSummary(@CurrentUser() user: AuthUser): AggregateMetrics {
    return this.metricsRepository.getAggregateByUser(user.userId);
  }

  @Get('admin/summary')
  public getAdminSummary(): AggregateMetrics {
    return this.metricsRepository.getAggregateAll();
  }

  @Get('tools')
  public getToolSummary(): ToolSummary[] {
    return this.toolMetricsRepository.getToolSummary();
  }

  @Get('tools/:toolName')
  public getToolPerformance(
    @Param('toolName') toolName: string,
    @Query('limit') limit?: string
  ): ToolMetricsRecord[] {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.toolMetricsRepository.getToolPerformance(
      toolName,
      isNaN(parsedLimit) ? 50 : parsedLimit
    );
  }
}
