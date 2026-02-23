import { Controller, Get } from '@nestjs/common';

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
