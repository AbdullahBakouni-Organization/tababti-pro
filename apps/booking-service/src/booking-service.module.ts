import { Module } from '@nestjs/common';
import { BookingServiceController } from './booking-service.controller';
import { BookingServiceService } from './booking-service.service';
import { DatabaseModule } from '@app/common/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [BookingServiceController],
  providers: [BookingServiceService],
})
export class BookingServiceModule {}
