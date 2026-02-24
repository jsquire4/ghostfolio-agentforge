import { Injectable } from '@nestjs/common';

import { AuditEntry } from '../common/interfaces';
import { AuditRepository } from '../database/audit.repository';

@Injectable()
export class AuditService {
  constructor(private readonly auditRepository: AuditRepository) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.auditRepository.log(entry);
  }

  async getByUser(userId: string): Promise<AuditEntry[]> {
    return this.auditRepository.getByUser(userId);
  }
}
