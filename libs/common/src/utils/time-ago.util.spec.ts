import { BadRequestException } from '@nestjs/common';
import { timeAgo, timeToMinutes, minutesToTime } from './time-ago.util';

describe('timeAgo', () => {
  it('should return null when no date is provided', () => {
    expect(timeAgo()).toBeNull();
    expect(timeAgo(undefined)).toBeNull();
  });

  it('should return "now" for a very recent date', () => {
    const now = new Date();
    expect(timeAgo(now)).toBe('now');
  });

  it('should return minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(timeAgo(fiveMinAgo)).toBe('5m');
  });

  it('should return hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000);
    expect(timeAgo(threeHoursAgo)).toBe('3h');
  });

  it('should return days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000);
    expect(timeAgo(twoDaysAgo)).toBe('2d');
  });

  it('should return months ago', () => {
    const twoMonthsAgo = new Date(Date.now() - 2 * 2592000 * 1000);
    expect(timeAgo(twoMonthsAgo)).toBe('2mo');
  });

  it('should return years ago', () => {
    const twoYearsAgo = new Date(Date.now() - 2 * 31536000 * 1000);
    expect(timeAgo(twoYearsAgo)).toBe('2y');
  });
});

describe('timeToMinutes', () => {
  it('should convert "00:00" to 0', () => {
    expect(timeToMinutes('00:00')).toBe(0);
  });

  it('should convert "09:30" to 570', () => {
    expect(timeToMinutes('09:30')).toBe(570);
  });

  it('should convert "23:59" to 1439', () => {
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('should throw BadRequestException for invalid format', () => {
    expect(() => timeToMinutes('abc')).toThrow(BadRequestException);
  });

  it('should throw BadRequestException for out-of-range hours', () => {
    expect(() => timeToMinutes('25:00')).toThrow(BadRequestException);
  });

  it('should throw BadRequestException for out-of-range minutes', () => {
    expect(() => timeToMinutes('10:60')).toThrow(BadRequestException);
  });

  it('should throw BadRequestException for negative hours', () => {
    expect(() => timeToMinutes('-1:00')).toThrow(BadRequestException);
  });
});

describe('minutesToTime', () => {
  it('should convert 0 to "00:00"', () => {
    expect(minutesToTime(0)).toBe('00:00');
  });

  it('should convert 570 to "09:30"', () => {
    expect(minutesToTime(570)).toBe('09:30');
  });

  it('should convert 1439 to "23:59"', () => {
    expect(minutesToTime(1439)).toBe('23:59');
  });

  it('should throw BadRequestException for negative minutes', () => {
    expect(() => minutesToTime(-1)).toThrow(BadRequestException);
  });

  it('should throw BadRequestException for minutes >= 1440', () => {
    expect(() => minutesToTime(1440)).toThrow(BadRequestException);
  });

  it('should throw BadRequestException for non-integer minutes', () => {
    expect(() => minutesToTime(10.5)).toThrow(BadRequestException);
  });
});
