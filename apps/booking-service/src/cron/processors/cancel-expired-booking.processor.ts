import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Booking,
  BookingDocument,
} from '@app/common/database/schemas/booking.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '@app/common/database/schemas/slot.schema';
import { SlotStatus } from '@app/common/database/schemas/common.enums';
import { CacheService } from '@app/common/cache/cache.service';
import { invalidateBookingCaches } from '@app/common/utils/cache-invalidation.util';

export interface CancelExpiredBookingJobData {
  bookingId: string;
  doctorId: string;
  patientId: string | null;
  slotId: string;
}

@Processor('CANCEL_EXPIRED_BOOKING')
export class CancelExpiredBookingProcessor {
  private readonly logger = new Logger(CancelExpiredBookingProcessor.name);

  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    private readonly cacheService: CacheService,
  ) {}

  @Process('PROCESS_CANCEL_EXPIRED_BOOKING')
  async process(job: Job<CancelExpiredBookingJobData>): Promise<void> {
    const { bookingId, doctorId, patientId, slotId } = job.data;

    try {
      // Guarded atomic transition: avoids the read-then-write race where a
      // concurrent cancellation flipped BOOKED → AVAILABLE between the read
      // and the update.
      await this.slotModel.updateOne(
        { _id: new Types.ObjectId(slotId), status: SlotStatus.BOOKED },
        {
          $set: { status: SlotStatus.INVALIDATED },
          $inc: { version: 1 },
        },
      );

      await invalidateBookingCaches(
        this.cacheService,
        doctorId,
        patientId ?? undefined,
        this.logger,
      );

      this.logger.log(
        `Side-effects done for expired-pending booking ${bookingId}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed side-effects for expired booking ${bookingId}: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }
}
