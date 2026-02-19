import { Module } from '@nestjs/common';
import { SlotGenerationService } from './slot.service';
import { SlotController } from './slot.controller';
import { CacheModule } from '@app/common/cache/cache.module';
import { DatabaseModule } from '@app/common/database/database.module';
import { SlotKafkaController } from './slot-kafka.controller';
import { BullModule } from '@nestjs/bull';
import { WorkingHoursUpdateProcessor } from './processors/update-working-hours.processor';

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
    DatabaseModule,
    CacheModule,
  ],
  providers: [SlotGenerationService, WorkingHoursUpdateProcessor],
  controllers: [SlotController, SlotKafkaController],
  exports: [SlotGenerationService],
})
export class SlotModule {}
