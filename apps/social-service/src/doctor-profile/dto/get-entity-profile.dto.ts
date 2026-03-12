import { IsEnum, IsMongoId } from 'class-validator';

export enum EntityType {
  HOSPITAL = 'hospital',
  CENTER = 'center',
}

export class GetEntityProfileDto {
  @IsMongoId()
  id: string;

  @IsEnum(EntityType)
  type: EntityType;
}
