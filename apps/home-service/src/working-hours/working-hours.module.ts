import { Module } from '@nestjs/common';
import { WorkingHoursController } from './working-hours.controller';
import { WorkingHoursService } from './working-hours.service';
import { DatabaseModule } from '@app/common/database/database.module';
import { CacheModule } from '@app/common/cache/cache.module';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { ConflictDetectionService } from './conflict-detection.service';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 5,
      },
    ]),
    KafkaModule,
    DatabaseModule,
    CacheModule,
  ],
  controllers: [WorkingHoursController],
  providers: [
    WorkingHoursService,
    ConflictDetectionService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class WorkingHoursModule {}
