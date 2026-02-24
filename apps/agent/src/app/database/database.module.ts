import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuditRepository } from './audit.repository';
import { DatabaseService } from './database.service';
import { FeedbackRepository } from './feedback.repository';
import { InsightRepository } from './insight.repository';

@Global()
@Module({
  exports: [
    DatabaseService,
    InsightRepository,
    AuditRepository,
    FeedbackRepository
  ],
  imports: [ConfigModule],
  providers: [
    DatabaseService,
    InsightRepository,
    AuditRepository,
    FeedbackRepository
  ]
})
export class DatabaseModule {}
