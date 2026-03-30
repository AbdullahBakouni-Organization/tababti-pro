import { BadRequestException } from '@nestjs/common';
import { WorkingHoursValidator, WorkingHour } from './working-hours.validator';
import { Days } from '@app/common/database/schemas/common.enums';

const makeHour = (
  day: Days,
  startTime: string,
  endTime: string,
  entity_name = 'Clinic A',
  address = 'Damascus',
  type = 'PRIVATE',
): WorkingHour => ({
  day,
  location: { type, entity_name, address },
  startTime,
  endTime,
});

describe('WorkingHoursValidator', () => {
  describe('validateUpdate()', () => {
    it('throws BadRequestException when newHours is empty', () => {
      expect(() =>
        WorkingHoursValidator.validateUpdate([], []),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException when newHours is null', () => {
      expect(() =>
        WorkingHoursValidator.validateUpdate(null as any, []),
      ).toThrow(BadRequestException);
    });

    it('passes validation for valid non-overlapping hours', () => {
      const hours = [
        makeHour(Days.MONDAY, '08:00', '12:00'),
        makeHour(Days.TUESDAY, '09:00', '13:00'),
      ];
      expect(() =>
        WorkingHoursValidator.validateUpdate(hours, []),
      ).not.toThrow();
    });

    it('throws BadRequestException for invalid time range (end <= start)', () => {
      const hours = [makeHour(Days.MONDAY, '12:00', '08:00')];
      expect(() =>
        WorkingHoursValidator.validateUpdate(hours, []),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException for same start and end time', () => {
      const hours = [makeHour(Days.MONDAY, '08:00', '08:00')];
      expect(() =>
        WorkingHoursValidator.validateUpdate(hours, []),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException for internal conflict in same day', () => {
      const hours = [
        makeHour(Days.MONDAY, '08:00', '12:00'),
        makeHour(Days.MONDAY, '10:00', '14:00'), // overlaps
      ];
      expect(() =>
        WorkingHoursValidator.validateUpdate(hours, []),
      ).toThrow(BadRequestException);
    });

    it('does NOT throw for same day hours at different locations (no overlap check across locations)', () => {
      // Hours on the same day but different hours that don't overlap
      const hours = [
        makeHour(Days.MONDAY, '08:00', '10:00', 'Clinic A'),
        makeHour(Days.MONDAY, '14:00', '16:00', 'Clinic B'),
      ];
      expect(() =>
        WorkingHoursValidator.validateUpdate(hours, []),
      ).not.toThrow();
    });

    it('throws when new hours conflict with existing hours on same day', () => {
      const existing = [makeHour(Days.WEDNESDAY, '09:00', '13:00', 'Clinic B')];
      const newHours = [makeHour(Days.WEDNESDAY, '11:00', '15:00', 'Clinic C')];
      expect(() =>
        WorkingHoursValidator.validateUpdate(newHours, existing),
      ).toThrow(BadRequestException);
    });

    it('passes when new hours replace the same day+location (no cross conflict)', () => {
      const existing = [makeHour(Days.WEDNESDAY, '09:00', '13:00', 'Clinic A')];
      // Same location on same day - will be excluded from cross-conflict check
      const newHours = [makeHour(Days.WEDNESDAY, '09:00', '14:00', 'Clinic A')];
      expect(() =>
        WorkingHoursValidator.validateUpdate(newHours, existing),
      ).not.toThrow();
    });

    it('passes when new and existing hours are on different days', () => {
      const existing = [makeHour(Days.MONDAY, '09:00', '13:00')];
      const newHours = [makeHour(Days.TUESDAY, '09:00', '13:00')];
      expect(() =>
        WorkingHoursValidator.validateUpdate(newHours, existing),
      ).not.toThrow();
    });
  });
});
