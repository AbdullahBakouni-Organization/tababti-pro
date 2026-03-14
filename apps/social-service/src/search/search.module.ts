import { Module, forwardRef } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bull';

import { DatabaseModule } from '@app/common/database/database.module';
import { SearchController } from './search.controller';
import { SearchCoreModule } from './search-core.module';
import { SearchQueriesModule } from './queries/search.queries.module';
import { SearchBuildersModule } from './builders/search.builders.module';
import { UsersModule } from './users/users.module';

/**
 * SearchModule is the owner of all Bull queues used in this slice:
 *   - 'ai'               → existing AI processing
 *   - 'route-processing' → RoutingService (used inside UsersModule)
 *   - 'matrix-processing'→ RoutingService (used inside UsersModule)
 *
 * Because UsersModule is imported here, NestJS makes the registered queues
 * available to every provider inside UsersModule via DI — no need to call
 * BullModule.registerQueue() again inside UsersModule.
 */
@Module({
  imports: [
    // ── Global / infrastructure ────────────────────────────────────────────
    CacheModule.register({ isGlobal: true }),

    EventEmitterModule.forRoot(),

    DatabaseModule,

    // ── Bull queues (register ALL queues used anywhere in this module tree) ──
    BullModule.registerQueue(
      {
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
      },
      {
        name: 'route-processing',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 86400 },
        },
      },
      {
        name: 'matrix-processing',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 86400 },
        },
      },
    ),

    // ── Feature sub-modules ────────────────────────────────────────────────
    forwardRef(() => SearchCoreModule),
    forwardRef(() => SearchQueriesModule),
    forwardRef(() => SearchBuildersModule),

    // ── Nearby / map search ────────────────────────────────────────────────
    UsersModule, // no forwardRef needed — no circular dep with SearchModule
  ],
  controllers: [SearchController],
})
export class SearchModule {}
