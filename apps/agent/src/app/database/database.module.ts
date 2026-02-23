import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseService } from './database.service';

@Global()
@Module({
  exports: [DatabaseService],
  imports: [ConfigModule],
  providers: [DatabaseService]
})
export class DatabaseModule {}
