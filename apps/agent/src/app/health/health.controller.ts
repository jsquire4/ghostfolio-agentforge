import { Controller, Get } from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator';

@Public()
@Controller('v1/health')
export class HealthController {
  @Get()
  public getHealth(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString()
    };
  }
}
