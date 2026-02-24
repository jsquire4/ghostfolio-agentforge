import { Injectable } from '@nestjs/common';

import { ToolCallRecord } from '../common/interfaces';

@Injectable()
export class VerificationService {
  /* eslint-disable @typescript-eslint/no-unused-vars */
  async runAll(
    _response: string,
    _toolCalls: ToolCallRecord[],
    _userId: string
  ): Promise<{ warnings: string[]; flags: string[] }> {
    /* eslint-enable @typescript-eslint/no-unused-vars */
    return { warnings: [], flags: [] };
  }
}
