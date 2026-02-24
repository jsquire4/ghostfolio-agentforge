import { createKeyv } from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

@Global()
@Module({
  exports: [RedisService, REDIS_CLIENT],
  imports: [
    ConfigModule,
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      isGlobal: true,
      useFactory: async (configService: ConfigService) => {
        const password = configService.get<string>('REDIS_PASSWORD');
        const host = configService.get<string>('REDIS_HOST', 'localhost');
        const port = configService.get<string>('REDIS_PORT', '6379');
        const db = configService.get<string>('REDIS_DB', '0');
        const ttl = configService.get<number>('AGENT_CONVERSATION_TTL', 86400);

        const encodedPassword = password
          ? encodeURIComponent(password)
          : undefined;
        const url = `redis://${encodedPassword ? `:${encodedPassword}@` : ''}${host}:${port}/${db}`;

        return {
          stores: [createKeyv(url)],
          ttl
        };
      }
    })
  ],
  providers: [
    RedisService,
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD')
        })
    }
  ]
})
export class RedisModule {}
