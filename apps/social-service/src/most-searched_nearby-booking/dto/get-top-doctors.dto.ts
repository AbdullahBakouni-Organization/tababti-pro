import { IsOptional, IsNumberString } from 'class-validator';

export class GetTopDoctorsDto {
  @IsOptional()
  @IsNumberString()
  limit?: string; //Number of Most Searched Doctors
}
