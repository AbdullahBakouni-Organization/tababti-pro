import { Module } from '@nestjs/common';
import { SlotGenerationService } from './slot.service';
import { SlotController } from './slot.controller';
import { CacheModule } from '@app/common/cache/cache.module';
import { DatabaseModule } from '@app/common/database/database.module';
import { SlotKafkaController } from './slot-kafka.controller';

@Module({
  imports: [DatabaseModule, CacheModule],
  providers: [SlotGenerationService],
  controllers: [SlotController, SlotKafkaController],
  exports: [SlotGenerationService],
})
export class SlotModule {}
