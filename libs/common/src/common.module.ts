import { Module } from '@nestjs/common';
import { CommonService } from './common.service';
import { KafkaModule } from './kafka/kafka.module';
import { RedisModule } from './redis/redis.module';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';

@Module({
  providers: [CommonService],
  exports: [CommonService],
  imports: [KafkaModule, RedisModule, DatabaseModule, CacheModule],
})
export class CommonModule {}
