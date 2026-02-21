import { Module, forwardRef } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from '@app/common/database/database.module';

import { SearchController } from './search.controller';
import { SearchCoreModule } from './search-core.module';
import { SearchQueriesModule } from './queries/search.queries.module';
import { SearchBuildersModule } from './builders/search.builders.module';

@Module({
  imports: [
    CacheModule.register({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60, limit: 20 }],
    }),
    EventEmitterModule.forRoot(),
    BullModule.registerQueue({
      name: 'ai',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86400 },
      },
      settings: {
        stalledInterval: 30000,
        maxStalledCount: 1,
        guardInterval: 5000,
        retryProcessDelay: 5000,
      },
    }),
    DatabaseModule,

    forwardRef(() => SearchCoreModule),
    forwardRef(() => SearchQueriesModule),
    forwardRef(() => SearchBuildersModule),
  ],
  controllers: [SearchController],
})
export class SearchModule {}
