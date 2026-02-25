import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuditRepository } from './audit.repository';
import { DatabaseService } from './database.service';
import { EvalsRepository } from './evals.repository';
import { FeedbackRepository } from './feedback.repository';
import { InsightRepository } from './insight.repository';
import { MetricsRepository } from './metrics.repository';

@Global()
@Module({
  exports: [
    DatabaseService,
    InsightRepository,
    AuditRepository,
    FeedbackRepository,
    MetricsRepository,
    EvalsRepository
  ],
  imports: [ConfigModule],
  providers: [
    DatabaseService,
    InsightRepository,
    AuditRepository,
    FeedbackRepository,
    MetricsRepository,
    EvalsRepository
  ]
})
export class DatabaseModule {}
