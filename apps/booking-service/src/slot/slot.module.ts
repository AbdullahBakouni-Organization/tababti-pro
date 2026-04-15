import { Module } from '@nestjs/common';
import { SlotGenerationService } from './slot.service';
import { SlotController } from './slot.controller';
import { CacheModule } from '@app/common/cache/cache.module';
import { DatabaseModule } from '@app/common/database/database.module';
import { SlotKafkaController } from './slot-kafka.controller';
import { BullModule } from '@nestjs/bull';
import { WorkingHoursUpdateProcessorV2 } from './processors/update-working-hours.processor';
import { FcmModule } from '@app/common/fcm';
import { SlotGenerationProcessor } from './processors/generate-working-hours.processor';
import { WorkingHoursDeleteProcessor } from './processors/delete-working-hours.processor';
import { InspectionDurationUpdateProcessor } from './processors/update-inspection-duration.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'WORKING_HOURS_UPDATE',
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
    BullModule.registerQueue({
      name: 'WORKING_HOURS_GENERATE',
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
    BullModule.registerQueue({
      name: 'WORKING_HOURS_DELETE',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
    BullModule.registerQueue({
      name: 'INSPECTION_DURATION_UPDATE',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
    DatabaseModule,
    CacheModule,
    FcmModule,
  ],
  providers: [
    SlotGenerationService,
    WorkingHoursUpdateProcessorV2,
    SlotGenerationProcessor,
    WorkingHoursDeleteProcessor,
    InspectionDurationUpdateProcessor,
  ],
  controllers: [SlotController, SlotKafkaController],
  exports: [SlotGenerationService],
})
export class SlotModule {}
