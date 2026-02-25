import { ImportService } from '@ghostfolio/api/app/import/import.service';
import { UserService } from '@ghostfolio/api/app/user/user.service';

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { UserCreatedEvent } from './user-created.event';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const seedPortfolio: any[] = require('./seed-portfolio.json');

@Injectable()
export class UserCreatedListener {
  public constructor(
    private readonly importService: ImportService,
    private readonly userService: UserService
  ) {}

  @OnEvent(UserCreatedEvent.getName())
  async handleUserCreatedEvent(event: UserCreatedEvent) {
    const userId = event.getUserId();
    const accountId = event.getAccountId();

    Logger.log(
      `Seeding portfolio for new user '${userId}'`,
      'UserCreatedListener'
    );

    try {
      const user = await this.userService.user({ id: userId });

      if (!user) {
        Logger.warn(
          `User '${userId}' not found, skipping portfolio seed`,
          'UserCreatedListener'
        );
        return;
      }

      const activitiesDto = (seedPortfolio as any[]).map((activity) => ({
        ...activity,
        accountId
      }));

      await this.importService.import({
        activitiesDto,
        user,
        accountsWithBalancesDto: [],
        assetProfilesWithMarketDataDto: [],
        tagsDto: [],
        maxActivitiesToImport: Number.MAX_SAFE_INTEGER
      });

      Logger.log(
        `Successfully seeded ${activitiesDto.length} activities for user '${userId}'`,
        'UserCreatedListener'
      );
    } catch (error) {
      Logger.warn(
        `Failed to seed portfolio for user '${userId}': ${error.message}`,
        'UserCreatedListener'
      );
    }
  }
}
