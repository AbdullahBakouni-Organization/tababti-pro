import {
  IsOptional,
  IsString,
  IsEnum,
  IsMongoId,
  ValidateIf,
  isEnum,
  IsDateString,
} from 'class-validator';
import {
  City,
  GeneralSpecialty,
  PrivateMedicineSpecialty,
} from '@app/common/database/schemas/common.enums';
import { SubCities } from '@app/common/database/schemas/sub-cities.schema';

export class UpdateDoctorProfileDto {
  // ====== City & Subcity ======
  @IsOptional()
  @IsEnum(City)
  city?: City;

  @IsOptional()
  @IsEnum(SubCities)
  subcity?: SubCities;
  // ====== Specializations ======
  @IsOptional()
  @IsEnum(GeneralSpecialty)
  publicSpecialization?: GeneralSpecialty;

  @ValidateIf((o) => o.privateSpecialization)
  @IsEnum(PrivateMedicineSpecialty, {
    message: 'Private specialization must match a valid category',
  })
  privateSpecialization?: PrivateMedicineSpecialty;

  // ====== Personal Info ======
  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  // ====== Images ======
  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  certificateImage?: string;

  @IsOptional()
  @IsString()
  licenseImage?: string;

  @IsOptional()
  @IsDateString()
  experienceStartDate?: Date;

}
