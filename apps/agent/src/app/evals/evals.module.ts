import { Module } from '@nestjs/common';

import { EvalsController } from './evals.controller';

@Module({
  controllers: [EvalsController]
})
export class EvalsModule {}
