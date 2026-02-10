import { Module } from '@nestjs/common';
import { WorkingHoursController } from './working-hours.controller';
import { WorkingHoursService } from './working-hours.service';
import { DatabaseModule } from '@app/common/database/database.module';
import { CacheModule } from '@app/common/cache/cache.module';
import { KafkaModule } from '@app/common/kafka/kafka.module';

@Module({
  imports: [KafkaModule, DatabaseModule, CacheModule],
  controllers: [WorkingHoursController],
  providers: [WorkingHoursService],
})
export class WorkingHoursModule {}
