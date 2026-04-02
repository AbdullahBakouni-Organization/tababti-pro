import { Module } from '@nestjs/common';
import { BookingValidationService } from './booking-validation.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [BookingValidationService],
  exports: [BookingValidationService],
})
export class BookingValidationModule {}
