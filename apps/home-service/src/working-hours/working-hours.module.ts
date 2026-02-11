import { Module } from '@nestjs/common';
import { WorkingHoursController } from './working-hours.controller';
import { WorkingHoursService } from './working-hours.service';
import { DatabaseModule } from '@app/common/database/database.module';
import { CacheModule } from '@app/common/cache/cache.module';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { BullModule } from '@nestjs/bull';
import { ConflictDetectionService } from './conflict-detection.service';
import { WorkingHoursUpdateProcessor } from './processors/working-hours-update.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'working-hours-update',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 500, // Keep last 500 failed jobs for debugging
      },
    }),
    KafkaModule,
    DatabaseModule,
    CacheModule,
  ],
  controllers: [WorkingHoursController],
  providers: [
    WorkingHoursService,
    ConflictDetectionService,
    WorkingHoursUpdateProcessor,
  ],
})
export class WorkingHoursModule {}
