import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { GhostfolioClientService } from './ghostfolio-client.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [GhostfolioClientService],
  exports: [GhostfolioClientService]
})
export class GhostfolioModule {}
