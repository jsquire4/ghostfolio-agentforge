import { Module } from '@nestjs/common';

import { EvalRunnerService } from './eval-runner.service';
import { EvalsController } from './evals.controller';

@Module({
  controllers: [EvalsController],
  providers: [EvalRunnerService]
})
export class EvalsModule {}
