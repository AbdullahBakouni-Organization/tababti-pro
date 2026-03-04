// dto/search-patients.dto.ts
import { IsString, IsOptional, IsEnum, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { BookingStatus } from '@app/common/database/schemas/common.enums';

export class SearchPatientsDto {
  @IsString()
  @MinLength(1)
  @Transform(({ value }) => value?.trim())
  searchTerm: string;

  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @IsOptional()
  @Transform(({ value }) => parseInt(value) || 1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => Math.min(parseInt(value) || 20, 50))
  limit?: number = 20;
}

export interface PatientSearchResultDto {
  patientId: string;
  username: string;
  phone: string;
  image: string;
  bookings: PatientBookingDto[];
  totalBookings: number;
}

export interface PatientBookingDto {
  bookingId: string;
  status: BookingStatus;
  bookingDate: Date;
  bookingTime: string;
  location: {
    type: string;
    entity_name: string;
    address: string;
  };
  price: number;
  createdAt: Date;
}

export interface SearchPatientsResponseDto {
  results: PatientSearchResultDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  searchTerm: string;
}
