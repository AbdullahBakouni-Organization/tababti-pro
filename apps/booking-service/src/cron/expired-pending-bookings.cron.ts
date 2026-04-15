import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import {
  Booking,
  BookingDocument,
} from '@app/common/database/schemas/booking.schema';
import {
  Doctor,
  DoctorDocument,
} from '@app/common/database/schemas/doctor.schema';
import { BookingStatus } from '@app/common/database/schemas/common.enums';
import {
  formatArabicDate,
  getSyriaDate,
} from '@app/common/utils/get-syria-date';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';

const SYSTEM_CANCEL_REASON =
  'System auto-cancelled: appointment date passed without confirmation';

@Injectable()
export class ExpiredPendingBookingsCron {
  private readonly logger = new Logger(ExpiredPendingBookingsCron.name);

  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    @InjectQueue('CANCEL_EXPIRED_BOOKING')
    private readonly cancelQueue: Queue,
    private readonly kafkaProducer: KafkaService,
  ) {}

  /**
   * Runs every day at 02:00 Syria time. Cancels every PENDING booking whose
   * bookingDate is strictly before today (Asia/Damascus) and notifies the
   * doctor via WhatsApp. Slot/cache cleanup is dispatched per-booking to a
   * Bull queue so a single slow side-effect cannot stall the sweep.
   */
  @Cron('0 2 * * *', { timeZone: 'Asia/Damascus' })
  async cancelExpiredPendingBookings(): Promise<void> {
    const startedAt = Date.now();
    const todaySyria = getSyriaDate();

    this.logger.log(
      `🕑 [ExpiredPendingBookingsCron] Sweep starting (cutoff < ${todaySyria.toISOString()})`,
    );

    const expired = await this.bookingModel
      .find({
        status: BookingStatus.PENDING,
        bookingDate: { $lt: todaySyria },
      })
      .select('_id doctorId patientId slotId bookingDate bookingTime')
      .lean()
      .exec();

    this.logger.log(
      `[ExpiredPendingBookingsCron] Found ${expired.length} expired pending booking(s)`,
    );

    let processed = 0;
    let failed = 0;

    for (const booking of expired) {
      try {
        const updated = await this.bookingModel.updateOne(
          { _id: booking._id, status: BookingStatus.PENDING },
          {
            $set: {
              status: BookingStatus.CANCELLED_BY_SYSTEM,
              cancellation: {
                cancelledBy: 'SYSTEM',
                reason: SYSTEM_CANCEL_REASON,
                cancelledAt: new Date(),
              },
            },
          },
        );

        if (updated.modifiedCount === 0) {
          continue;
        }

        await this.notifyDoctor(booking).catch((err: Error) =>
          this.logger.error(
            `Failed to notify doctor for booking ${booking._id.toString()}: ${err.message}`,
          ),
        );

        await this.cancelQueue.add(
          'PROCESS_CANCEL_EXPIRED_BOOKING',
          {
            bookingId: booking._id.toString(),
            doctorId: booking.doctorId.toString(),
            patientId: booking.patientId ? booking.patientId.toString() : null,
            slotId: booking.slotId.toString(),
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true,
            removeOnFail: 100,
          },
        );

        processed++;
      } catch (error) {
        failed++;
        const err = error as Error;
        this.logger.error(
          `Failed to cancel expired booking ${booking._id.toString()}: ${err.message}`,
          err.stack,
        );
      }
    }

    const duration = ((Date.now() - startedAt) / 1000).toFixed(2);
    this.logger.log(
      `[ExpiredPendingBookingsCron] ✅ Done in ${duration}s — processed: ${processed}, failed: ${failed}, total: ${expired.length}`,
    );
  }

  private async notifyDoctor(booking: {
    _id: unknown;
    doctorId: { toString(): string };
    bookingDate: Date;
    bookingTime: string;
  }): Promise<void> {
    const doctor = await this.doctorModel
      .findById(booking.doctorId)
      .select('firstName lastName phones')
      .lean()
      .exec();

    if (!doctor) return;

    const phone = doctor.phones?.[0]?.normal?.[0];
    if (!phone) {
      this.logger.warn(
        `Doctor ${booking.doctorId.toString()} has no phone — skipping WhatsApp.`,
      );
      return;
    }

    const dateStr = formatArabicDate(booking.bookingDate);
    const doctorName = `${doctor.firstName} ${doctor.lastName}`.trim();

    const text =
      `الدكتور *${doctorName}* 👋\n\n` +
      `تم إلغاء حجز تلقائياً من قبل النظام لأن المريض لم يؤكد الموعد ومرّ تاريخ الحجز.\n\n` +
      `📅 *التاريخ:* ${dateStr}\n` +
      `⏰ *الوقت:* ${booking.bookingTime}\n` +
      `📋 *السبب:* انتهاء صلاحية الحجز دون تأكيد\n\n` +
      `— فريق *طبابتي* 💙`;

    try {
      this.kafkaProducer.emit(KAFKA_TOPICS.WHATSAPP_SEND_MESSAGE, {
        phone,
        text,
        lang: 'ar',
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to emit WhatsApp expired-cancel for booking ${String(booking._id)}: ${err.message}`,
      );
    }
  }
}
