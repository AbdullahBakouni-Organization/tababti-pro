import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AddWorkingHoursDto } from './dto/add-working-hours.dto';
import {
  UpdateWorkingHoursDto,
  ConflictCheckResponseDto,
} from './dto/update-working-hours.dto';
import {
  AffectedBookingDto,
  CheckDeleteConflictDto,
  CheckDeleteConflictResponseDto,
  DeleteWorkingHoursDto,
} from './dto/delete-working-hours.dto';
import {
  AffectedInspectionBookingDto,
  CheckInspectionDurationConflictDto,
  CheckInspectionDurationConflictResponseDto,
  UpdateInspectionDurationDto,
} from './dto/update-inspection-duration.dto';
import { InspectionDurationChangedEvent } from '@app/common/kafka/interfaces/kafka-event.interface';
import {
  Booking,
  BookingDocument,
} from '@app/common/database/schemas/booking.schema';
import { BookingStatus } from '@app/common/database/schemas/common.enums';
import { WorkingHoursDeletedEvent } from '@app/common/kafka/interfaces/kafka-event.interface';
import { timeToMinutes } from '@app/common/utils/time-ago.util';
import { getSyriaDate } from '@app/common/utils/get-syria-date';
import {
  Doctor,
  DoctorDocument,
} from '@app/common/database/schemas/doctor.schema';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import { CacheService } from '@app/common/cache/cache.service';

import { ConflictDetectionService } from './conflict-detection.service';
import { KafkaService } from '@app/common/kafka/kafka.service';
import {
  SlotGenerationEvent,
  WorkingHoursAddedEvent,
} from '@app/common/kafka/interfaces/kafka-event.interface';
import { WorkingHoursValidator } from './working-hours.validator';
import { invalidateBookingCaches } from '@app/common/utils/cache-invalidation.util';
interface WorkingHour {
  day: string;
  startTime: string;
  endTime: string;
  location: {
    type: string;
    entity_name: string;
    address: string;
  };
}

@Injectable()
export class WorkingHoursService {
  private readonly logger = new Logger(WorkingHoursService.name);

  constructor(
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    private kafkaProducer: KafkaService,
    private readonly cacheManager: CacheService,
    private readonly conflictDetectionService: ConflictDetectionService,
  ) {}

  /* -------------------------------------------------------------------------- */
  /*                   DELETE WORKING HOURS (CHECK + COMMIT)                    */
  /* -------------------------------------------------------------------------- */

  /**
   * Dry-run: report the bookings that would be cancelled if the given
   * working-hours entry is deleted. Does not mutate anything.
   */
  async checkDeleteConflict(
    doctorId: string,
    dto: CheckDeleteConflictDto,
  ): Promise<CheckDeleteConflictResponseDto> {
    const doctor = await this.loadDoctor(doctorId);
    this.findExistingEntryOrThrow(doctor, dto);

    const affectedBookings = await this.findBookingsWithinEntry(doctorId, dto);

    const hasConflicts = affectedBookings.length > 0;

    return {
      hasConflicts,
      affectedBookingsCount: affectedBookings.length,
      affectedBookings,
      warningMessage: hasConflicts
        ? `Deleting this working-hours entry will cancel ${affectedBookings.length} booking(s). Patients will be notified.`
        : undefined,
    };
  }

  /**
   * Commit: remove the matching working-hours entry, bump version, emit
   * WORKING_HOURS_DELETED for the booking-service to handle cleanup.
   */
  async deleteWorkingHours(
    doctorId: string,
    dto: DeleteWorkingHoursDto,
  ): Promise<{
    message: string;
    doctorId: string;
    workingHoursVersion: number;
  }> {
    if (dto.confirm !== true) {
      throw new BadRequestException(
        'confirm must be true to proceed with deletion',
      );
    }

    const doctor = await this.loadDoctor(doctorId);
    const matchIndex = this.findExistingEntryOrThrow(doctor, dto);

    const deletedEntry = doctor.workingHours[matchIndex];

    doctor.workingHours = doctor.workingHours.filter(
      (_, i) => i !== matchIndex,
    );
    doctor.workingHoursVersion += 1;
    await doctor.save();

    await invalidateBookingCaches(this.cacheManager, doctorId.toString());

    const event: WorkingHoursDeletedEvent = {
      eventType: 'WORKING_HOURS_DELETED',
      timestamp: new Date(),
      doctorId,
      deletedWorkingHour: {
        day: deletedEntry.day,
        location: {
          type: deletedEntry.location.type,
          entity_name: deletedEntry.location.entity_name,
          address: deletedEntry.location.address,
        },
        startTime: deletedEntry.startTime,
        endTime: deletedEntry.endTime,
      },
      version: doctor.workingHoursVersion,
      metadata: { source: 'doctor-service', version: '1.0' },
    };

    try {
      this.kafkaProducer.emit(KAFKA_TOPICS.WORKING_HOURS_DELETED, event);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to publish WORKING_HOURS_DELETED: ${err.message}`,
        err.stack,
      );
    }

    this.logger.log(
      `Working hours entry deleted for doctor ${doctorId} on ${deletedEntry.day} @ ${deletedEntry.location.entity_name}`,
    );

    return {
      message: 'Working hours entry deletion queued successfully',
      doctorId,
      workingHoursVersion: doctor.workingHoursVersion,
    };
  }

  private async loadDoctor(doctorId: string): Promise<DoctorDocument> {
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }
    const doctor = await this.doctorModel.findById(doctorId).exec();
    if (!doctor) {
      throw new NotFoundException(`Doctor with ID ${doctorId} not found`);
    }
    return doctor;
  }

  private findExistingEntryOrThrow(
    doctor: DoctorDocument,
    entry: CheckDeleteConflictDto | DeleteWorkingHoursDto,
  ): number {
    const index = (doctor.workingHours || []).findIndex(
      (wh) =>
        wh.day === entry.day &&
        wh.startTime === entry.startTime &&
        wh.endTime === entry.endTime &&
        wh.location.type === entry.location.type &&
        wh.location.entity_name === entry.location.entity_name &&
        wh.location.address === entry.location.address,
    );

    if (index === -1) {
      throw new NotFoundException(
        `No matching working-hours entry found for ${entry.day} @ ${entry.location.entity_name} (${entry.startTime}-${entry.endTime}).`,
      );
    }

    return index;
  }

  /**
   * Find bookings falling inside the working-hours entry the doctor wants to
   * delete. Mirrors the filter used by ConflictDetectionService.
   */
  private async findBookingsWithinEntry(
    doctorId: string,
    entry: CheckDeleteConflictDto,
  ): Promise<AffectedBookingDto[]> {
    const today = getSyriaDate();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 365);

    const bookings = await this.bookingModel
      .find({
        doctorId: new Types.ObjectId(doctorId),
        status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        bookingDate: { $gte: today, $lte: endDate },
        $or: [{ patientId: { $ne: null } }, { patientPhone: { $ne: null } }],
      })
      .populate('patientId', 'username phone')
      .populate('slotId')
      .lean()
      .exec();

    const entryStart = timeToMinutes(entry.startTime);
    const entryEnd = timeToMinutes(entry.endTime);

    const result: AffectedBookingDto[] = [];

    for (const booking of bookings) {
      const slot =
        booking.slotId &&
        typeof booking.slotId === 'object' &&
        'startTime' in booking.slotId
          ? (booking.slotId as any)
          : null;
      if (!slot) continue;

      if (slot.dayOfWeek?.toLowerCase() !== entry.day.toLowerCase()) continue;
      if (
        slot.location?.type !== entry.location.type ||
        slot.location?.entity_name !== entry.location.entity_name ||
        slot.location?.address !== entry.location.address
      ) {
        continue;
      }

      const slotStart = timeToMinutes(slot.startTime);
      const slotEnd = timeToMinutes(slot.endTime);
      if (slotStart < entryStart || slotEnd > entryEnd) continue;

      const populated =
        booking.patientId !== null &&
        typeof booking.patientId === 'object' &&
        'username' in booking.patientId
          ? (booking.patientId as unknown as {
              _id: Types.ObjectId;
              username: string;
              phone: string;
            })
          : null;

      const patientId = populated
        ? populated._id.toString()
        : (booking.patientPhone ?? '');
      const patientName = populated
        ? populated.username
        : (booking.patientName ?? 'Manual Patient');
      const patientContact = populated
        ? populated.phone
        : (booking.patientPhone ?? '');

      result.push({
        bookingId: booking._id.toString(),
        patientId,
        patientName,
        patientContact,
        appointmentDate: booking.bookingDate,
        appointmentTime: slot.startTime,
        status: booking.status,
      });
    }

    return result;
  }

  /* -------------------------------------------------------------------------- */
  /*              UPDATE INSPECTION DURATION (CHECK + COMMIT)                   */
  /* -------------------------------------------------------------------------- */

  async checkInspectionDurationConflict(
    doctorId: string,
    dto: CheckInspectionDurationConflictDto,
  ): Promise<CheckInspectionDurationConflictResponseDto> {
    const doctor = await this.loadDoctor(doctorId);

    const currentDuration: number | null =
      typeof doctor.inspectionDuration === 'number' &&
      doctor.inspectionDuration > 0
        ? doctor.inspectionDuration
        : null;

    // First-time setup: no duration configured yet → nothing to conflict with.
    if (currentDuration === null) {
      return {
        hasConflicts: false,
        durationChanged: true,
        currentInspectionDuration: null,
        newInspectionDuration: dto.inspectionDuration,
        affectedBookingsCount: 0,
        affectedBookings: [],
        warningMessage:
          'No inspection duration is configured yet. Submitting will set it for the first time.',
      };
    }

    const durationChanged = currentDuration !== dto.inspectionDuration;

    if (!durationChanged) {
      return {
        hasConflicts: false,
        durationChanged: false,
        currentInspectionDuration: currentDuration,
        newInspectionDuration: dto.inspectionDuration,
        affectedBookingsCount: 0,
        affectedBookings: [],
        warningMessage:
          'Inspection duration is unchanged. Price-only updates will not affect existing slots or bookings.',
      };
    }

    const affectedBookings = await this.findAllFutureActiveBookings(doctorId);
    const hasConflicts = affectedBookings.length > 0;

    return {
      hasConflicts,
      durationChanged: true,
      currentInspectionDuration: currentDuration,
      newInspectionDuration: dto.inspectionDuration,
      affectedBookingsCount: affectedBookings.length,
      affectedBookings,
      warningMessage: hasConflicts
        ? `Changing inspection duration will invalidate every future slot and cancel ${affectedBookings.length} active booking(s). Patients will be notified (app push or WhatsApp).`
        : 'No active bookings exist — the slot grid will be regenerated with no patient impact.',
    };
  }

  async updateInspectionDuration(
    doctorId: string,
    dto: UpdateInspectionDurationDto,
  ): Promise<{
    message: string;
    doctorId: string;
    inspectionDuration: number;
    inspectionPrice?: number;
    workingHoursVersion: number;
    regenerationTriggered: boolean;
  }> {
    if (dto.confirm !== true) {
      throw new BadRequestException(
        'confirm must be true to proceed with update',
      );
    }

    const doctor = await this.loadDoctor(doctorId);

    const hasWorkingHours =
      Array.isArray(doctor.workingHours) && doctor.workingHours.length > 0;
    const hasExistingDuration =
      typeof doctor.inspectionDuration === 'number' &&
      doctor.inspectionDuration > 0;

    // First-time setup: no duration yet → just persist it. No slot regeneration
    // is possible because there are no working hours yet; the doctor will add
    // them via the add-working-hours flow which generates slots from scratch.
    if (!hasExistingDuration) {
      doctor.inspectionDuration = dto.inspectionDuration;
      if (dto.inspectionPrice !== undefined) {
        doctor.inspectionPrice = dto.inspectionPrice;
      }
      await doctor.save();
      await invalidateBookingCaches(this.cacheManager, doctorId.toString());

      this.logger.log(
        `Inspection duration set for the first time for doctor ${doctorId}: ${dto.inspectionDuration}min`,
      );

      return {
        message: hasWorkingHours
          ? 'Inspection duration set.'
          : 'Inspection duration saved. Add working hours to generate appointment slots.',
        doctorId,
        inspectionDuration: doctor.inspectionDuration,
        inspectionPrice: doctor.inspectionPrice,
        workingHoursVersion: doctor.workingHoursVersion,
        regenerationTriggered: false,
      };
    }

    if (!hasWorkingHours) {
      throw new BadRequestException(
        'Doctor has no working hours configured. Add working hours first.',
      );
    }

    const oldInspectionDuration = doctor.inspectionDuration;
    const durationChanged = oldInspectionDuration !== dto.inspectionDuration;
    const priceChanged =
      dto.inspectionPrice !== undefined &&
      doctor.inspectionPrice !== dto.inspectionPrice;

    if (!durationChanged && !priceChanged) {
      this.logger.log(
        `No-op inspection update for doctor ${doctorId} (duration & price unchanged). Skipping save and slot invalidation.`,
      );
      return {
        message:
          'No changes detected. Inspection duration and price are unchanged.',
        doctorId,
        inspectionDuration: doctor.inspectionDuration,
        inspectionPrice: doctor.inspectionPrice,
        workingHoursVersion: doctor.workingHoursVersion,
        regenerationTriggered: false,
      };
    }

    if (priceChanged && dto.inspectionPrice !== undefined) {
      doctor.inspectionPrice = dto.inspectionPrice;
    }
    if (durationChanged) {
      doctor.inspectionDuration = dto.inspectionDuration;
      doctor.workingHoursVersion += 1;
    }
    await doctor.save();

    await invalidateBookingCaches(this.cacheManager, doctorId.toString());

    if (!durationChanged) {
      this.logger.log(
        `Inspection price updated for doctor ${doctorId} (duration unchanged — no slot regeneration).`,
      );
      return {
        message:
          'Inspection price updated. Slots were not regenerated because duration is unchanged.',
        doctorId,
        inspectionDuration: doctor.inspectionDuration,
        inspectionPrice: doctor.inspectionPrice,
        workingHoursVersion: doctor.workingHoursVersion,
        regenerationTriggered: false,
      };
    }

    const event: InspectionDurationChangedEvent = {
      eventType: 'INSPECTION_DURATION_CHANGED',
      timestamp: new Date(),
      doctorId,
      oldInspectionDuration,
      newInspectionDuration: dto.inspectionDuration,
      inspectionPrice: doctor.inspectionPrice,
      workingHours: doctor.workingHours.map((wh) => ({
        day: wh.day,
        location: {
          type: wh.location.type,
          entity_name: wh.location.entity_name,
          address: wh.location.address,
        },
        startTime: wh.startTime,
        endTime: wh.endTime,
      })),
      doctorInfo: {
        fullName:
          `${doctor.firstName} ${doctor.middleName ?? ''} ${doctor.lastName}`.trim(),
      },
      version: doctor.workingHoursVersion,
      metadata: { source: 'doctor-service', version: '1.0' },
    };

    try {
      this.kafkaProducer.emit(KAFKA_TOPICS.INSPECTION_DURATION_CHANGED, event);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to publish INSPECTION_DURATION_CHANGED: ${err.message}`,
        err.stack,
      );
    }

    this.logger.log(
      `Inspection duration changed for doctor ${doctorId}: ${oldInspectionDuration} → ${dto.inspectionDuration}`,
    );

    return {
      message:
        'Inspection duration update queued. All future slots will be regenerated and affected patients will be notified.',
      doctorId,
      inspectionDuration: doctor.inspectionDuration,
      inspectionPrice: doctor.inspectionPrice,
      workingHoursVersion: doctor.workingHoursVersion,
      regenerationTriggered: true,
    };
  }

  private async findAllFutureActiveBookings(
    doctorId: string,
  ): Promise<AffectedInspectionBookingDto[]> {
    const today = getSyriaDate();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 365);

    const bookings = await this.bookingModel
      .find({
        doctorId: new Types.ObjectId(doctorId),
        status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        bookingDate: { $gte: today, $lte: endDate },
        $or: [{ patientId: { $ne: null } }, { patientPhone: { $ne: null } }],
      })
      .populate('patientId', 'username phone')
      .lean()
      .exec();

    const result: AffectedInspectionBookingDto[] = [];
    for (const booking of bookings) {
      const populated =
        booking.patientId !== null &&
        typeof booking.patientId === 'object' &&
        'username' in booking.patientId
          ? (booking.patientId as unknown as {
              _id: Types.ObjectId;
              username: string;
              phone: string;
            })
          : null;

      const isAppPatient = !!populated;
      const patientId = populated
        ? populated._id.toString()
        : (booking.patientPhone ?? '');
      const patientName = populated
        ? populated.username
        : (booking.patientName ?? 'Manual Patient');
      const patientContact = populated
        ? populated.phone
        : (booking.patientPhone ?? '');

      result.push({
        bookingId: booking._id.toString(),
        patientId,
        patientName,
        patientContact,
        appointmentDate: booking.bookingDate,
        appointmentTime: booking.bookingTime,
        status: booking.status,
        isAppPatient,
      });
    }
    return result;
  }

  /* -------------------------------------------------------------------------- */
  /*                    INITIAL SETUP: ADD WORKING HOURS                        */
  /*            (Used when doctor first sets up their schedule)                 */
  /* -------------------------------------------------------------------------- */

  /**
   * Add working hours to a doctor (INITIAL SETUP - no conflicts possible)
   * This is for doctors who are setting up their schedule for the first time
   */
  async addWorkingHours(
    doctorId: string,
    addWorkingHoursDto: AddWorkingHoursDto,
  ): Promise<{
    message: string;
    doctorId: string;
    workingHours: any[];
    slotsGenerated: number;
    inspectionDuration: number;
  }> {
    // Validate doctor ID
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    // Find doctor
    const doctor = await this.doctorModel.findById(doctorId).exec();
    if (!doctor) {
      throw new NotFoundException(`Doctor with ID ${doctorId} not found`);
    }

    // Validate working hours don't overlap
    this.validateWorkingHours(addWorkingHoursDto.workingHours);
    this.checkIfSameAsExisting(
      addWorkingHoursDto.workingHours,
      doctor.workingHours,
    );
    WorkingHoursValidator.validateUpdate(
      addWorkingHoursDto.workingHours,
      doctor.workingHours,
    );
    // Check if this is the first time adding working hours
    const isFirstTime =
      !doctor.workingHours || doctor.workingHours.length === 0;

    // Update doctor with working hours and inspection details
    doctor.workingHours = addWorkingHoursDto.workingHours;
    doctor.inspectionDuration = addWorkingHoursDto.inspectionDuration;

    if (addWorkingHoursDto.inspectionPrice !== undefined) {
      doctor.inspectionPrice = addWorkingHoursDto.inspectionPrice;
    }

    await doctor.save();

    // Calculate total slots that will be generated
    const totalSlots = this.calculateTotalSlots(
      addWorkingHoursDto.workingHours,
      addWorkingHoursDto.inspectionDuration,
    );

    // Invalidate cached doctor data

    // Publish events
    if (isFirstTime) {
      // Publish slot generation event for booking service
      this.publishSlotGenerationEvent(doctor, addWorkingHoursDto);
    }
    await invalidateBookingCaches(this.cacheManager, doctorId.toString());
    // Publish working hours added event
    // this.publishWorkingHoursAddedEvent(doctor, addWorkingHoursDto);

    this.logger.log(
      `Working hours added for doctor ${doctorId}. Slots to be generated: ${totalSlots}`,
    );

    return {
      message: isFirstTime
        ? 'Working hours added successfully. Appointment slots are being generated.'
        : 'Working hours updated successfully.',
      doctorId: doctor._id.toString(),
      workingHours: doctor.workingHours,
      slotsGenerated: totalSlots,
      inspectionDuration: doctor.inspectionDuration,
    };
  }

  /* -------------------------------------------------------------------------- */
  /*                    REQUIREMENT 1: PRE-CHECK ROUTE (DRY RUN)                */
  /* -------------------------------------------------------------------------- */

  /**
   * Check for conflicts before updating working hours
   * This is the "dry run" that shows what will be affected
   */
  async checkWorkingHoursConflicts(
    doctorId: string,
    updateDto: UpdateWorkingHoursDto,
  ): Promise<ConflictCheckResponseDto> {
    // Validate doctor ID
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    // Find doctor
    const doctor = await this.doctorModel.findById(doctorId).exec();
    if (!doctor) {
      throw new NotFoundException(`Doctor with ID ${doctorId} not found`);
    }

    // Validate working hours format
    this.validateWorkingHours(updateDto.workingHours);
    this.checkIfSameAsExisting(updateDto.workingHours, doctor.workingHours);
    WorkingHoursValidator.validateUpdate(
      updateDto.workingHours,
      doctor.workingHours,
    );

    // Detect conflicts
    const { todayConflicts, futureConflicts } =
      await this.conflictDetectionService.detectConflicts(
        doctorId,
        updateDto.workingHours,
      );

    const totalConflicts = todayConflicts.length + futureConflicts.length;
    const hasConflicts = totalConflicts > 0;

    const allConflicts = [...todayConflicts, ...futureConflicts];
    const affectedPatients =
      this.conflictDetectionService.getUniquePatientCount(allConflicts);

    const response: ConflictCheckResponseDto = {
      hasConflicts,
      todayConflicts,
      futureConflicts,
      summary: {
        totalConflicts,
        todayCount: todayConflicts.length,
        futureCount: futureConflicts.length,
        affectedPatients,
      },
      warningMessage: hasConflicts
        ? `Updating working hours will cancel ${totalConflicts} appointment(s) affecting ${affectedPatients} patient(s). ${todayConflicts.length} appointments are scheduled for today.`
        : undefined,
    };

    this.logger.log(
      `Conflict check for doctor ${doctorId}: ${totalConflicts} conflicts found`,
    );

    return response;
  }

  /* -------------------------------------------------------------------------- */
  /*                 REQUIREMENT 2: EXECUTION ROUTE (CONFIRMED UPDATE)          */
  /* -------------------------------------------------------------------------- */

  /**
   * Update working hours and handle conflicts
   * This route actually performs the update after doctor confirms
   */
  async updateWorkingHours(doctorId: string, updateDto: UpdateWorkingHoursDto) {
    const doctor = await this.doctorModel.findById(doctorId);
    if (!doctor) throw new NotFoundException();

    this.validateWorkingHours(updateDto.workingHours);
    this.checkIfSameAsExisting(updateDto.workingHours, doctor.workingHours);
    WorkingHoursValidator.validateUpdate(
      updateDto.workingHours,
      doctor.workingHours,
    );

    const oldWorkingHours = doctor.workingHours;

    // ✅ احذف فقط نفس الـ day + location + entity_name + type
    const mergedWorkingHours = [
      ...oldWorkingHours.filter((oldWh) => {
        return !updateDto.workingHours.some(
          (newWh) =>
            oldWh.day === newWh.day &&
            oldWh.location.type === newWh.location.type &&
            oldWh.location.entity_name === newWh.location.entity_name &&
            oldWh.location.address === newWh.location.address,
        );
      }),
      ...updateDto.workingHours,
    ];

    const updatedDays = [...new Set(updateDto.workingHours.map((w) => w.day))];

    doctor.workingHours = mergedWorkingHours;
    doctor.workingHoursVersion += 1;
    await doctor.save();

    this.kafkaProducer.emit(KAFKA_TOPICS.WORKING_HOURS_UPDATED, {
      doctorId,
      updatedDays,
      oldWorkingHours,
      newWorkingHours: mergedWorkingHours,
      version: doctor.workingHoursVersion,
      inspectionDuration: updateDto.inspectionDuration,
      inspectionPrice: doctor.inspectionPrice,
    });

    return { message: 'Working hours updated successfully' };
  }

  /* -------------------------------------------------------------------------- */
  /*                            HELPER METHODS                                  */
  /* -------------------------------------------------------------------------- */

  /**
   * Calculate total number of slots that will be generated
   */
  private calculateTotalSlots(
    workingHours: WorkingHour[],
    inspectionDuration: number,
  ): number {
    let totalSlots = 0;

    for (const wh of workingHours) {
      const [startHour, startMin] = wh.startTime.split(':').map(Number);
      const [endHour, endMin] = wh.endTime.split(':').map(Number);

      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      const availableMinutes = endMinutes - startMinutes;

      const slotsPerDay = Math.floor(availableMinutes / inspectionDuration);
      totalSlots += slotsPerDay;
    }

    return totalSlots;
  }

  /**
   * Publish working hours added event
   */
  private publishWorkingHoursAddedEvent(
    doctor: DoctorDocument,
    dto: AddWorkingHoursDto | UpdateWorkingHoursDto,
  ): void {
    const event: WorkingHoursAddedEvent = {
      eventType: 'WORKING_HOURS_ADDED',
      timestamp: new Date(),
      data: {
        doctorId: doctor._id.toString(),
        workingHours: dto.workingHours.map((wh) => ({
          day: wh.day,
          location: {
            type: wh.location.type,
            entity_name: wh.location.entity_name,
            address: wh.location.address,
          },
          startTime: wh.startTime,
          endTime: wh.endTime,
        })),
        inspectionDuration: dto.inspectionDuration,
      },
      metadata: {
        source: 'doctor-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaProducer.emit(KAFKA_TOPICS.WORKING_HOURS_ADDED, event);
      this.logger.log(
        `Working hours added event published for doctor ${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to publish working hours added event: ${err.message}`,
        err.stack,
      );
    }
  }

  private validateWorkingHours(workingHours: WorkingHour[]): void {
    const dayMap = new Map<string, WorkingHour[]>();

    for (const wh of workingHours) {
      if (!this.isValidTimeRange(wh.startTime, wh.endTime)) {
        throw new BadRequestException(
          `Invalid time range: start time must be before end time for ${wh.day}`,
        );
      }

      if (!dayMap.has(wh.day)) {
        dayMap.set(wh.day, []);
      }

      const existing = dayMap.get(wh.day)!;

      for (const existingWh of existing) {
        // ✅ NEW: Check duplicate location (same day + same type + entity_name + address)
        const sameLocation =
          existingWh.location.type === wh.location.type &&
          existingWh.location.entity_name === wh.location.entity_name &&
          existingWh.location.address === wh.location.address;

        if (sameLocation) {
          throw new BadRequestException(
            `Duplicate location on ${wh.day}: cannot add multiple entries for "${wh.location.entity_name}" (${wh.location.type}) at "${wh.location.address}". Merge the time ranges into one entry instead.`,
          );
        }

        // existing overlap check
        if (
          this.hasTimeOverlap(
            wh.startTime,
            wh.endTime,
            existingWh.startTime,
            existingWh.endTime,
          )
        ) {
          throw new BadRequestException(
            `Doctor cannot work in two places at the same time on ${wh.day}. Conflict between ${wh.startTime}-${wh.endTime} and ${existingWh.startTime}-${existingWh.endTime}`,
          );
        }
      }

      existing.push(wh);
    }
  }

  private hasTimeOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string,
  ): boolean {
    const [h1, m1] = start1.split(':').map(Number);
    const [h2, m2] = end1.split(':').map(Number);
    const [h3, m3] = start2.split(':').map(Number);
    const [h4, m4] = end2.split(':').map(Number);

    const start1Minutes = h1 * 60 + m1;
    const end1Minutes = h2 * 60 + m2;
    const start2Minutes = h3 * 60 + m3;
    const end2Minutes = h4 * 60 + m4;

    return start1Minutes < end2Minutes && end1Minutes > start2Minutes;
  }

  private isValidTimeRange(startTime: string, endTime: string): boolean {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    return startMinutes < endMinutes;
  }

  /**
   * Publish slot generation event (for no-conflict scenarios)
   */

  /**
   * Publish slot generation event (for no-conflict scenarios)
   */
  private publishSlotGenerationEvent(
    doctor: DoctorDocument,
    dto: AddWorkingHoursDto | UpdateWorkingHoursDto,
  ): void {
    const event: SlotGenerationEvent = {
      eventType: 'SLOTS_GENERATE',
      timestamp: new Date(),
      data: {
        doctorId: doctor._id.toString(),
        WorkingHours: dto.workingHours.map((wh) => ({
          day: wh.day,
          location: {
            type: wh.location.type,
            entity_name: wh.location.entity_name,
            address: wh.location.address,
          },
          startTime: wh.startTime,
          endTime: wh.endTime,
        })),
        inspectionDuration: dto.inspectionDuration,
        inspectionPrice: dto.inspectionPrice,
        doctorInfo: {
          fullName: `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`,
        },
      },
      metadata: {
        source: 'doctor-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaProducer.emit(KAFKA_TOPICS.SLOTS_GENERATE, event);
      this.logger.log(
        `Slot generation event published for doctor ${doctor.firstName} ${doctor.lastName}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to publish slot generation event: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Get working hours (kept from original service)
   */
  async getWorkingHours(doctorId: string): Promise<any> {
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    const cacheKey = `doctor:${doctorId}:working-hours`;
    const cached = await this.cacheManager.get(cacheKey);

    if (cached) {
      return cached;
    }

    const doctor = await this.doctorModel
      .findById(doctorId)
      .select('workingHours inspectionDuration inspectionPrice')
      .lean()
      .exec();

    if (!doctor) {
      throw new NotFoundException(`Doctor with ID ${doctorId} not found`);
    }

    const result = {
      doctorId: doctorId,
      workingHours: doctor.workingHours || [],
      inspectionDuration: doctor.inspectionDuration,
      inspectionPrice: doctor.inspectionPrice,
    };

    await this.cacheManager.set(cacheKey, result, 120, 7200);

    return result;
  }

  private checkIfSameAsExisting(
    newHours: WorkingHour[],
    existingHours: WorkingHour[],
  ): void {
    for (const newWh of newHours) {
      const match = existingHours.find(
        (ex) =>
          ex.day === newWh.day &&
          ex.location.type === newWh.location.type &&
          ex.location.entity_name === newWh.location.entity_name &&
          ex.location.address === newWh.location.address &&
          ex.startTime === newWh.startTime &&
          ex.endTime === newWh.endTime,
      );

      if (match) {
        throw new BadRequestException(
          `Working hours for ${newWh.day} at "${newWh.location.entity_name}" (${newWh.startTime}-${newWh.endTime}) already exist with no changes.`,
        );
      }
    }
  }
}
