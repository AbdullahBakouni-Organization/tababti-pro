import { Module } from '@nestjs/common';
import { SlotGenerationService } from './slot.service';
import { SlotController } from './slot.controller';
import { CacheModule } from '@app/common/cache/cache.module';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { DatabaseModule } from '@app/common/database/database.module';

@Module({
  imports: [DatabaseModule, CacheModule],
  providers: [SlotGenerationService],
  controllers: [SlotController],
})
export class SlotModule {}
