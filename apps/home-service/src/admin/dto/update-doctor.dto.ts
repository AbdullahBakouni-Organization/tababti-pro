import { PartialType, OmitType } from '@nestjs/swagger';
import { AdminCreateDoctorDto } from './create-doctor.dto';

/**
 * All fields from AdminCreateDoctorDto are optional for updates, except:
 * - `password` — use a dedicated change-password endpoint
 * - `workingHours` — managed via the doctor's own working-hours flow
 */
export class AdminUpdateDoctorDto extends PartialType(
  OmitType(AdminCreateDoctorDto, ['password', 'workingHours'] as const),
) {}
