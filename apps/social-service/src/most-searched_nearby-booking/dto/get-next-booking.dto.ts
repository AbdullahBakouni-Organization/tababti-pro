import { IsOptional, IsString } from 'class-validator';

export class GetNextBookingDto {
  @IsOptional()
  @IsString()
  doctorId?: string; //nearest booking for one doctor
}
