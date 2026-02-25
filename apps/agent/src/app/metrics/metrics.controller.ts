import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards
} from '@nestjs/common';

import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
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
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number
  ): RequestMetrics[] {
    return this.metricsRepository.getByUser(
      user.userId,
      Math.min(limit, 100),
      offset
    );
  }

  @Get('summary')
  public getSummary(@CurrentUser() user: AuthUser): AggregateMetrics {
    return this.metricsRepository.getAggregateByUser(user.userId);
  }

  @Get('admin/summary')
  @UseGuards(AdminGuard)
  public getAdminSummary(): AggregateMetrics {
    return this.metricsRepository.getAggregateAll();
  }

  @Get('tools')
  @UseGuards(AdminGuard)
  public getToolSummary(): ToolSummary[] {
    return this.toolMetricsRepository.getToolSummary();
  }

  @Get('tools/:toolName')
  @UseGuards(AdminGuard)
  public getToolPerformance(
    @Param('toolName') toolName: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number
  ): ToolMetricsRecord[] {
    if (!/^[a-z_-]{1,50}$/.test(toolName)) {
      return [];
    }
    return this.toolMetricsRepository.getToolPerformance(
      toolName,
      Math.min(limit, 100)
    );
  }
}
