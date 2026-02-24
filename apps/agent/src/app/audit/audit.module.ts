import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit.service';

// AuditRepository is injected from DatabaseModule (@Global — no import needed here)
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService]
})
export class AuditModule {}
