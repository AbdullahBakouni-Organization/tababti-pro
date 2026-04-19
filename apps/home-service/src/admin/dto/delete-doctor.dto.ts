import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class DeleteDoctorDto {
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'Doctor MongoDB ObjectId to delete',
  })
  @IsMongoId({ message: 'doctorId must be a valid MongoDB ObjectId' })
  doctorId: string;
}
