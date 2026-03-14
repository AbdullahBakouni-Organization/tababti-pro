import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { DatabaseModule } from '@app/common/database/database.module';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { CacheModule } from '@app/common/cache/cache.module';
import { MinioModule } from '../minio/minio.module';

@Module({
  imports: [DatabaseModule, KafkaModule, CacheModule, MinioModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
