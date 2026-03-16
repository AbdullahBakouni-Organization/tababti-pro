import { BadRequestException } from '@nestjs/common';

export function timeAgo(date?: Date): string | null {
  if (!date) return null;

  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);

  const intervals = [
    { label: 'y', seconds: 31536000 },
    { label: 'mo', seconds: 2592000 },
    { label: 'd', seconds: 86400 },
    { label: 'h', seconds: 3600 },
    { label: 'm', seconds: 60 },
  ];

  for (const interval of intervals) {
    const value = Math.floor(seconds / interval.seconds);
    if (value >= 1) return `${value}${interval.label}`;
  }

  return 'now';
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new BadRequestException(`Invalid time format: ${time}`);
  }

  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 24 * 60) {
    throw new BadRequestException(`Invalid minutes value: ${minutes}`);
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');

  return `${hh}:${mm}`;
}
