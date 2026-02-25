import { ImportModule } from '@ghostfolio/api/app/import/import.module';
import { OrderModule } from '@ghostfolio/api/app/order/order.module';
import { RedisCacheModule } from '@ghostfolio/api/app/redis-cache/redis-cache.module';
import { UserModule } from '@ghostfolio/api/app/user/user.module';
import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { DataProviderModule } from '@ghostfolio/api/services/data-provider/data-provider.module';
import { ExchangeRateDataModule } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.module';
import { DataGatheringModule } from '@ghostfolio/api/services/queues/data-gathering/data-gathering.module';

import { Module } from '@nestjs/common';

import { AssetProfileChangedListener } from './asset-profile-changed.listener';
import { PortfolioChangedListener } from './portfolio-changed.listener';
import { UserCreatedListener } from './user-created.listener';

@Module({
  imports: [
    ConfigurationModule,
    DataGatheringModule,
    DataProviderModule,
    ExchangeRateDataModule,
    ImportModule,
    OrderModule,
    RedisCacheModule,
    UserModule
  ],
  providers: [
    AssetProfileChangedListener,
    PortfolioChangedListener,
    UserCreatedListener
  ]
})
export class EventsModule {}
