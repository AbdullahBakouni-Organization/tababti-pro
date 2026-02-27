// dto/get-entity-profile.dto.ts
import { IsEnum, IsMongoId } from 'class-validator';

export enum EntityType {
  DOCTOR = 'doctor',
  HOSPITAL = 'hospital',
  CENTER = 'center',
}

export class GetEntityProfileDto {
  @IsMongoId()
  id: string;

  @IsEnum(EntityType)
  type: EntityType;
}
