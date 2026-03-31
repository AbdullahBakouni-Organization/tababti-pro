import { ApiProperty } from '@nestjs/swagger';

export class DoctorStatusStatsDto {
  @ApiProperty() total: number;
  @ApiProperty() thisMonth: number;
  @ApiProperty() lastMonth: number;
  @ApiProperty() changePercentage: number;
  @ApiProperty() isIncreased: boolean;
}

export class DoctorsStatsDto {
  @ApiProperty() total: number;
  @ApiProperty() thisMonth: number;
  @ApiProperty() lastMonth: number;
  @ApiProperty() changePercentage: number;
  @ApiProperty() isIncreased: boolean;
  @ApiProperty({ type: DoctorStatusStatsDto }) approved: DoctorStatusStatsDto;
  @ApiProperty({ type: DoctorStatusStatsDto }) rejected: DoctorStatusStatsDto;
}

export class EntityStatsDto {
  @ApiProperty() total: number;
  @ApiProperty() thisMonth: number;
  @ApiProperty() lastMonth: number;
  @ApiProperty() changePercentage: number;
  @ApiProperty() isIncreased: boolean;
}

export class AdminStatsResponseDto {
  @ApiProperty({ type: DoctorsStatsDto }) doctors: DoctorsStatsDto;
  @ApiProperty({ type: EntityStatsDto }) users: EntityStatsDto;
  @ApiProperty({ type: EntityStatsDto }) bookings: EntityStatsDto;
}
