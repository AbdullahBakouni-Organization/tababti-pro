import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
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
import {
  formatArabicDate,
  formatDate,
  getSyriaDate,
} from '@app/common/utils/get-syria-date';
import { CacheService } from '@app/common/cache/cache.service';
import { invalidateBookingCaches } from '@app/common/utils/cache-invalidation.util';

export interface InspectionDurationJobData {
  doctorId: string;
  oldInspectionDuration: number;
  newInspectionDuration: number;
  inspectionPrice?: number;
  workingHours: Array<{
    day: Days;
    location: {
      type: WorkigEntity;
      entity_name: string;
      address: string;
    };
    startTime: string;
    endTime: string;
  }>;
  doctorInfo: { fullName: string };
  version: number;
}

const CANCEL_REASON = 'Doctor updated inspection duration';

@Processor('INSPECTION_DURATION_UPDATE')
export class InspectionDurationUpdateProcessor {
  private readonly logger = new Logger(InspectionDurationUpdateProcessor.name);
  private readonly SLOT_GENERATION_WEEKS = 48;

  constructor(
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    private kafkaProducer: KafkaService,
    private readonly cacheService: CacheService,
  ) {}

  @Process('PROCESS_INSPECTION_DURATION_UPDATE')
  async process(job: Job<InspectionDurationJobData>): Promise<void> {
    const {
      doctorId,
      newInspectionDuration,
      inspectionPrice,
      workingHours,
      doctorInfo,
      version,
    } = job.data;
    const doctorObjectId = new Types.ObjectId(doctorId);

    this.logger.log(
      `Processing INSPECTION_DURATION_UPDATE for doctor ${doctorId} → ${newInspectionDuration}min`,
    );

    // Idempotency: browser retries republish the same Kafka event, so the
    // inspection-duration event may fire multiple times. Inspection duration
    // is doctor-wide (affects every day), so the lock is keyed by doctorId
    // only — not per-day. The first job wins; duplicates arriving inside
    // the TTL window skip cleanly instead of racing the wipe + regenerate.
    const lockKey = `lock:inspection_duration_update:${doctorId}`;
    const acquired = await this.cacheService.acquireLock(lockKey, 300);
    if (!acquired) {
      this.logger.warn(
        `Skipped PROCESS_INSPECTION_DURATION_UPDATE for doctor=${doctorId}: lock ${lockKey} held by concurrent job`,
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
      const today = getSyriaDate();
      const todayStart = new Date(today);
      todayStart.setUTCHours(0, 0, 0, 0);

      const bookedSlots = await this.slotModel
        .find({
          doctorId: doctorObjectId,
          date: { $gte: todayStart },
          status: SlotStatus.BOOKED,
        })
        .session(session);

      const invalidatedSlotIds: Types.ObjectId[] = [];

      for (const slot of bookedSlots) {
        const booking = await this.bookingModel
          .findOne({ slotId: slot._id })
          .populate<{ patientId: User }>('patientId', 'fcmToken')
          .populate<{ doctorId: Doctor }>('doctorId', 'firstName lastName')
          .session(session)
          .exec();

        if (!booking) continue;

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
          : doctorInfo.fullName;

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

        invalidatedSlotIds.push(slot._id);
      }

      // Keep INVALIDATED audit rows ONLY for slots tied to cancelled bookings.
      // Delete every other future slot so the unique index
      // { doctorId, date, startTime, 'location.entity_name' } is clear before
      // regeneration — otherwise insertMany hits 11000 and new slots are dropped.
      if (invalidatedSlotIds.length > 0) {
        await this.slotModel.updateMany(
          { _id: { $in: invalidatedSlotIds } },
          { $set: { status: SlotStatus.INVALIDATED } },
          { session },
        );
      }

      await this.slotModel.deleteMany(
        {
          doctorId: doctorObjectId,
          date: { $gte: todayStart },
          _id: { $nin: invalidatedSlotIds },
        },
        { session },
      );

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }

    const keptInvalidated = await this.slotModel
      .find({
        doctorId: doctorObjectId,
        status: SlotStatus.INVALIDATED,
        date: { $gte: getSyriaDate() },
      })
      .select('date startTime location.entity_name')
      .lean()
      .exec();

    const blockedKeys = new Set(
      keptInvalidated.map(
        (s) =>
          `${new Date(s.date).toISOString()}|${s.startTime}|${s.location?.entity_name ?? ''}`,
      ),
    );

    const newSlots = this.buildNewSlots(
      doctorObjectId,
      workingHours,
      newInspectionDuration,
      inspectionPrice,
      doctorInfo,
      version,
    ).filter((s) => {
      const key = `${(s.date as Date).toISOString()}|${s.startTime}|${s.location?.entity_name ?? ''}`;
      return !blockedKeys.has(key);
    });
    await this.batchInsertSlots(newSlots);

    this.logger.log(
      `Regenerated ${newSlots.length} slots for doctor ${doctorId} at ${newInspectionDuration}min duration`,
    );

    if (affectedBookings.length > 0) {
      await this.sendCancellationNotifications(affectedBookings).catch((err) =>
        this.logger.error('FCM notification error:', err),
      );
    }

    if (affectedManualBookings.length > 0) {
      this.sendWhatsappCancellations(affectedManualBookings);
    }

    const affectedPatientIds = [
      ...new Set(affectedBookings.map((b) => b.patientId)),
    ];
    await invalidateBookingCaches(
      this.cacheService,
      doctorObjectId.toString(),
      affectedPatientIds.length > 0 ? affectedPatientIds : undefined,
      this.logger,
    );

    this.logger.log(
      `INSPECTION_DURATION_UPDATE done. Cancelled: ${affectedBookings.length} (app), ${affectedManualBookings.length} (manual).`,
    );
  }

  private buildNewSlots(
    doctorId: Types.ObjectId,
    workingHours: InspectionDurationJobData['workingHours'],
    duration: number,
    price: number | undefined,
    doctorInfo: { fullName: string },
    version: number,
  ): Partial<AppointmentSlot>[] {
    const slots: Partial<AppointmentSlot>[] = [];
    const today = getSyriaDate();

    for (let week = 0; week < this.SLOT_GENERATION_WEEKS; week++) {
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const currentDate = new Date(today);
        currentDate.setDate(today.getDate() + week * 7 + dayOffset);
        const dayOfWeek = this.getDayName(currentDate.getUTCDay());

        const dayWorkingHours = workingHours.filter(
          (wh) => wh.day.toLowerCase() === dayOfWeek.toLowerCase(),
        );

        for (const wh of dayWorkingHours) {
          slots.push(
            ...this.generateSlotsForDay(
              doctorId,
              currentDate,
              dayOfWeek as Days,
              wh.startTime,
              wh.endTime,
              duration,
              wh.location,
              price,
              doctorInfo,
              version,
            ),
          );
        }
      }
    }
    return slots;
  }

  private generateSlotsForDay(
    doctorId: Types.ObjectId,
    date: Date,
    dayOfWeek: Days,
    startTime: string,
    endTime: string,
    duration: number,
    location: any,
    price: number | undefined,
    doctorInfo: { fullName: string },
    version: number,
  ): Partial<AppointmentSlot>[] {
    const slots: Partial<AppointmentSlot>[] = [];
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    let currentMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    while (currentMinutes + duration <= endMinutes) {
      const slotStartHour = Math.floor(currentMinutes / 60);
      const slotStartMin = currentMinutes % 60;
      const slotEndMinutes = currentMinutes + duration;
      const slotEndHour = Math.floor(slotEndMinutes / 60);
      const slotEndMin = slotEndMinutes % 60;

      const slotDate = new Date(date);
      slotDate.setUTCHours(0, 0, 0, 0);

      slots.push({
        doctorId,
        status: SlotStatus.AVAILABLE,
        date: slotDate,
        startTime: `${String(slotStartHour).padStart(2, '0')}:${String(slotStartMin).padStart(2, '0')}`,
        endTime: `${String(slotEndHour).padStart(2, '0')}:${String(slotEndMin).padStart(2, '0')}`,
        dayOfWeek,
        duration,
        price,
        location,
        doctorInfo: { fullName: doctorInfo.fullName },
        isRecurring: true,
        workingHoursVersion: version,
      });

      currentMinutes += duration;
    }
    return slots;
  }

  private async batchInsertSlots(
    slots: Partial<AppointmentSlot>[],
  ): Promise<void> {
    if (slots.length === 0) return;
    const BATCH_SIZE = 100;
    for (let i = 0; i < slots.length; i += BATCH_SIZE) {
      const batch = slots.slice(i, i + BATCH_SIZE);
      try {
        await this.slotModel.insertMany(batch, { ordered: false });
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
        this.logger.warn(
          `Skipped duplicate slots in batch ${i / BATCH_SIZE + 1}`,
        );
      }
    }
  }

  private getDayName(utcDay: number): string {
    return [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ][utcDay];
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
          `Failed to publish FCM notification for booking ${booking.bookingId}: ${err.message}`,
        );
      }
    }
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
        `📋 *السبب:* قام الطبيب بتحديث مدة الكشف\n\n` +
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
}
