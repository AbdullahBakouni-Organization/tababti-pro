import { BadRequestException } from '@nestjs/common';
import { timeToMinutes } from '@app/common/utils/time-ago.util';
import { Days } from '@app/common/database/schemas/common.enums';

export interface WorkingHour {
  day: Days;
  location: {
    type: string;
    entity_name: string;
    address: string;
  };
  startTime: string;
  endTime: string;
}

export class WorkingHoursValidator {
  static validateUpdate(
    newHours: WorkingHour[],
    existingHours: WorkingHour[],
  ): void {
    if (!newHours || newHours.length === 0) {
      throw new BadRequestException('Working hours cannot be empty.');
    }

    // 1️⃣ فحص صحة الوقت
    this.validateTimeRanges(newHours);

    // 2️⃣ منع تعارض داخلي داخل البيانات الجديدة
    this.validateInternalConflicts(newHours);

    // 3️⃣ استبعاد الأيام التي سيتم تحديثها
    const existingAfterPartialReplace = existingHours.filter((oldWh) => {
      return !newHours.some(
        (newWh) =>
          oldWh.day === newWh.day &&
          oldWh.location.type === newWh.location.type &&
          oldWh.location.entity_name === newWh.location.entity_name &&
          oldWh.location.address === newWh.location.address,
      );
    });

    // 4️⃣ فحص تعارض مع الأيام الأخرى فقط
    this.validateCrossConflicts(newHours, existingAfterPartialReplace);
  }

  // ----------------------------------------------------

  private static validateTimeRanges(hours: WorkingHour[]) {
    for (const wh of hours) {
      const start = timeToMinutes(wh.startTime);
      const end = timeToMinutes(wh.endTime);

      if (end <= start) {
        throw new BadRequestException(
          `Invalid time range on ${wh.day}: ${wh.startTime}-${wh.endTime}`,
        );
      }
    }
  }

  // ----------------------------------------------------

  private static validateInternalConflicts(hours: WorkingHour[]) {
    for (let i = 0; i < hours.length; i++) {
      for (let j = i + 1; j < hours.length; j++) {
        if (hours[i].day !== hours[j].day) continue;

        const start1 = timeToMinutes(hours[i].startTime);
        const end1 = timeToMinutes(hours[i].endTime);
        const start2 = timeToMinutes(hours[j].startTime);
        const end2 = timeToMinutes(hours[j].endTime);

        const overlap = start1 < end2 && end1 > start2;

        if (overlap) {
          throw new BadRequestException(
            `New working hours overlap on ${hours[i].day}.
${hours[i].startTime}-${hours[i].endTime}
conflicts with
${hours[j].startTime}-${hours[j].endTime}`,
          );
        }
      }
    }
  }

  // ----------------------------------------------------

  private static validateCrossConflicts(
    newHours: WorkingHour[],
    existingHours: WorkingHour[],
  ) {
    for (const newWh of newHours) {
      const newStart = timeToMinutes(newWh.startTime);
      const newEnd = timeToMinutes(newWh.endTime);

      for (const oldWh of existingHours) {
        if (oldWh.day !== newWh.day) continue;

        const oldStart = timeToMinutes(oldWh.startTime);
        const oldEnd = timeToMinutes(oldWh.endTime);

        const overlap = newStart < oldEnd && newEnd > oldStart;

        if (overlap) {
          throw new BadRequestException(
            `Working hours conflict on ${newWh.day}.
New range ${newWh.startTime}-${newWh.endTime}
overlaps with existing ${oldWh.startTime}-${oldWh.endTime}.`,
          );
        }
      }
    }
  }
}
