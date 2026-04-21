import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { DateTime } from 'luxon';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '@app/common/database/schemas/slot.schema';
import {
  BookingStatus,
  Days,
  SlotStatus,
  WorkigEntity,
} from '@app/common/database/schemas/common.enums';
import {
  Booking,
  BookingDocument,
} from '@app/common/database/schemas/booking.schema';
import { User } from '@app/common/database/schemas/user.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import { formatArabicDate, formatDate } from '@app/common/utils/get-syria-date';
import { CacheService } from '@app/common/cache/cache.service';
import { invalidateBookingCaches } from '@app/common/utils/cache-invalidation.util';
import { timeToMinutes } from '@app/common/utils/time-ago.util';

export interface WorkingHoursDeleteJobData {
  doctorId: string;
  deletedWorkingHour: {
    day: Days;
    location: {
      type: WorkigEntity;
      entity_name: string;
      address: string;
    };
    startTime: string;
    endTime: string;
  };
  version: number;
}

const CANCEL_REASON = 'Working hours removed by doctor';

@Processor('WORKING_HOURS_DELETE')
export class WorkingHoursDeleteProcessor {
  private readonly logger = new Logger(WorkingHoursDeleteProcessor.name);

  constructor(
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    private kafkaProducer: KafkaService,
    private readonly cacheService: CacheService,
  ) {}

  @Process('PROCESS_WORKING_HOURS_DELETE')
  async processWorkingHoursDelete(
    job: Job<WorkingHoursDeleteJobData>,
  ): Promise<void> {
    const { doctorId, deletedWorkingHour } = job.data;
    const doctorObjectId = new Types.ObjectId(doctorId);

    this.logger.log(
      `Processing WORKING_HOURS_DELETE for doctor ${doctorId} on ${deletedWorkingHour.day} @ ${deletedWorkingHour.location.entity_name}`,
    );

    // Idempotency: browser retries republish the same Kafka event, landing
    // multiple jobs on the queue. A per-(doctor, day) Redis lock lets only
    // the first job invalidate the day; duplicates arriving inside the TTL
    // window skip cleanly instead of racing the same transactional rewrite.
    const lockKey = `lock:working_hours_delete:${doctorId}:${deletedWorkingHour.day}`;
    const acquired = await this.cacheService.acquireLock(lockKey, 300);
    if (!acquired) {
      this.logger.warn(
        `Skipped PROCESS_WORKING_HOURS_DELETE for doctor=${doctorId} day=${deletedWorkingHour.day}: lock ${lockKey} held by concurrent job`,
      );
      return;
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    const affectedBookings: Array<{
      bookingId: string;
      doctorId: string;
      fcmToken: string;
      patientId: string;
      doctorName: string;
      appointmentDate: Date;
      appointmentTime: string;
    }> = [];

    const affectedManualBookings: Array<{
      bookingId: string;
      patientName: string;
      patientPhone: string;
      doctorName: string;
      appointmentDate: Date;
      appointmentTime: string;
    }> = [];

    try {
      const futureDates = this.getNext48WeeksDatesForDay(
        deletedWorkingHour.day,
      );
      const entryStart = timeToMinutes(deletedWorkingHour.startTime);
      const entryEnd = timeToMinutes(deletedWorkingHour.endTime);

      // Single bulk fetch covering every future occurrence of this weekday
      // at the deleted location — replaces 48 per-week queries. Matches the
      // same location filter used in the original per-date query.
      const windowStart = futureDates[0];
      const windowEnd = new Date(
        futureDates[futureDates.length - 1].getTime() + 24 * 60 * 60 * 1000 - 1,
      );

      const candidateSlotsAll = await this.slotModel
        .find({
          doctorId: doctorObjectId,
          dayOfWeek: deletedWorkingHour.day,
          date: { $gte: windowStart, $lte: windowEnd },
          status: { $ne: SlotStatus.INVALIDATED },
          'location.type': deletedWorkingHour.location.type,
          'location.entity_name': deletedWorkingHour.location.entity_name,
          'location.address': deletedWorkingHour.location.address,
        })
        .session(session);

      this.logger.log(
        `Bulk-fetched ${candidateSlotsAll.length} slots across ${futureDates.length} future ${deletedWorkingHour.day}s for doctor ${doctorId}`,
      );

      for (const slot of candidateSlotsAll) {
        const slotStart = timeToMinutes(slot.startTime);
        const slotEnd = timeToMinutes(slot.endTime);
        if (slotStart < entryStart || slotEnd > entryEnd) continue;

        if (slot.status === SlotStatus.BOOKED) {
          const booking = await this.bookingModel
            .findOne({ slotId: slot._id })
            .populate<{ patientId: User }>('patientId', 'fcmToken')
            .populate<{ doctorId: Doctor }>('doctorId', 'firstName lastName')
            .session(session)
            .exec();

          if (booking) {
            const patient =
              booking.patientId && typeof booking.patientId !== 'string'
                ? (booking.patientId as unknown as User)
                : null;
            const doctor =
              booking.doctorId && typeof booking.doctorId !== 'string'
                ? (booking.doctorId as unknown as Doctor)
                : null;

            const doctorName = doctor
              ? `${doctor.firstName} ${doctor.lastName}`
              : '';

            if (patient?.fcmToken && doctor) {
              affectedBookings.push({
                bookingId: booking._id.toString(),
                patientId: patient._id.toString(),
                doctorId: doctor._id.toString(),
                fcmToken: patient.fcmToken,
                doctorName,
                appointmentDate: booking.bookingDate,
                appointmentTime: booking.bookingTime,
              });
            } else if (!patient && booking.patientPhone) {
              affectedManualBookings.push({
                bookingId: booking._id.toString(),
                patientName: booking.patientName ?? '',
                patientPhone: booking.patientPhone,
                doctorName,
                appointmentDate: booking.bookingDate,
                appointmentTime: booking.bookingTime,
              });
            }

            await this.bookingModel.updateOne(
              { _id: booking._id },
              {
                status: BookingStatus.CANCELLED_BY_DOCTOR,
                cancellation: {
                  cancelledBy: 'DOCTOR',
                  reason: CANCEL_REASON,
                  cancelledAt: new Date(),
                },
              },
              { session },
            );
          }
        }

        slot.status = SlotStatus.INVALIDATED;
        await slot.save({ session });
      }

      await session.commitTransaction();

      if (affectedBookings.length > 0) {
        await this.sendCancellationNotifications(affectedBookings).catch(
          (err) => this.logger.error('Notification error:', err),
        );
        const affectedPatientIds = [
          ...new Set(affectedBookings.map((b) => b.patientId)),
        ];
        await invalidateBookingCaches(
          this.cacheService,
          doctorObjectId.toString(),
          affectedPatientIds,
          this.logger,
        );
      } else {
        await invalidateBookingCaches(
          this.cacheService,
          doctorObjectId.toString(),
        );
      }

      if (affectedManualBookings.length > 0) {
        this.sendWhatsappCancellations(affectedManualBookings);
      }

      this.logger.log(
        `WORKING_HOURS_DELETE done. Affected bookings: ${affectedBookings.length} (app), ${affectedManualBookings.length} (manual)`,
      );
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private getNext48WeeksDatesForDay(day: Days): Date[] {
    const dayMap: Record<Days, number> = {
      [Days.SUNDAY]: 7,
      [Days.MONDAY]: 1,
      [Days.TUESDAY]: 2,
      [Days.WEDNESDAY]: 3,
      [Days.THURSDAY]: 4,
      [Days.FRIDAY]: 5,
      [Days.SATURDAY]: 6,
    };

    const target = dayMap[day];
    let dt = DateTime.now().setZone('Asia/Damascus').startOf('day');
    while (dt.weekday !== target) dt = dt.plus({ days: 1 });

    const dates: Date[] = [];
    for (let i = 0; i < 48; i++) {
      const d = dt.plus({ weeks: i });
      dates.push(new Date(Date.UTC(d.year, d.month - 1, d.day, 0, 0, 0, 0)));
    }
    return dates;
  }

  private sendWhatsappCancellations(
    manual: Array<{
      bookingId: string;
      patientName: string;
      patientPhone: string;
      doctorName: string;
      appointmentDate: Date;
      appointmentTime: string;
    }>,
  ): void {
    this.logger.log(
      `Publishing WhatsApp cancellations for ${manual.length} manual patient(s)`,
    );

    for (const b of manual) {
      if (!b.patientPhone) continue;

      const dateStr = formatArabicDate(b.appointmentDate);
      const greeting = b.patientName
        ? `عزيزي/عزيزتي ${b.patientName}`
        : 'عزيزي المريض';
      const text =
        `${greeting} 👋\n\n` +
        `نأسف لإبلاغك بأنه تم إلغاء موعدك مع الدكتور *${b.doctorName}*.\n\n` +
        `📅 *التاريخ:* ${dateStr}\n` +
        `⏰ *الوقت:* ${b.appointmentTime}\n` +
        `📋 *السبب:* تم إلغاء ساعات العمل من قبل الطبيب\n\n` +
        `يرجى التواصل مع العيادة لإعادة جدولة موعد جديد.\n\n` +
        `— فريق *طبابتي* 💙`;

      try {
        this.kafkaProducer.emit(KAFKA_TOPICS.WHATSAPP_SEND_MESSAGE, {
          phone: b.patientPhone,
          text,
          lang: 'ar',
        });
      } catch (error) {
        const err = error as Error;
        this.logger.error(
          `Failed to emit WhatsApp cancellation for booking ${b.bookingId}: ${err.message}`,
        );
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async sendCancellationNotifications(
    affected: Array<{
      bookingId: string;
      doctorId: string;
      patientId: string;
      fcmToken: string;
      doctorName: string;
      appointmentDate: Date;
      appointmentTime: string;
    }>,
  ): Promise<void> {
    this.logger.log(
      `Publishing cancellation notifications for ${affected.length} patients`,
    );

    for (const booking of affected) {
      if (!booking.fcmToken) continue;

      const event = {
        eventType: 'BOOKING_CANCELLED_NOTIFICATION',
        timestamp: new Date(),
        data: {
          patientId: booking.patientId,
          doctorId: booking.doctorId,
          doctorName: booking.doctorName,
          fcmToken: booking.fcmToken,
          bookingId: booking.bookingId,
          appointmentDate: formatDate(booking.appointmentDate),
          appointmentTime: booking.appointmentTime,
          reason: CANCEL_REASON,
          type: 'DOCTOR_CANCELLED',
        },
        metadata: { source: 'notification-service', version: '1.0' },
      };

      try {
        this.kafkaProducer.emit(
          KAFKA_TOPICS.BOOKING_CANCELLED_NOTIFICATION,
          event,
        );
      } catch (error) {
        const err = error as Error;
        this.logger.error(
          `Failed to publish cancellation notification for booking ${booking.bookingId}: ${err.message}`,
        );
      }
    }
  }
}
