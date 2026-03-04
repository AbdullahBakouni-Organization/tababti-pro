import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { formatDoctorName } from '../../common/utiles/formatname.util';
import type { TravelMode } from './types/nearby.types';
import { FALLBACK_SPEEDS } from './types/nearby.types';
import type {
  NearbyEntity,
  DoctorNearbyEntity,
  HospitalNearbyEntity,
  CenterNearbyEntity,
} from '../../common/interfaces/nearby.interface';

@Injectable()
export class EntityMapper {
  // ─── Public ───────────────────────────────────────────────────────────────

  toResponse(
    entity: any,
    entityType: 'doctor' | 'hospital' | 'center',
  ): NearbyEntity {
    const base = {
      latitude: entity.latitude as number,
      longitude: entity.longitude as number,
      distanceKm: entity.distanceKm as number,
      durationMinutes: entity.durationMinutes as number,
      travelMode: entity.travelMode as TravelMode,
      routeAvailable: entity.routeAvailable as boolean,
    };

    switch (entityType) {
      // ── Doctor ─────────────────────────────────────────────────────────────
      case 'doctor': {
        // publicSpecializationId → populated ARRAY of objects
        const pubSpecArray: any[] = Array.isArray(entity.publicSpecializationId)
          ? entity.publicSpecializationId
          : entity.publicSpecializationId
            ? [entity.publicSpecializationId]
            : [];

        // privateSpecializationId → populated SINGLE object (or array edge-case)
        const privSpec = entity.privateSpecializationId;
        const privateSpecializations: string[] = privSpec
          ? Array.isArray(privSpec)
            ? privSpec.map((s: any) => s?.name).filter(Boolean)
            : privSpec?.name
              ? [privSpec.name]
              : []
          : [];

        const result: DoctorNearbyEntity = {
          ...base,
          entityType: 'doctor',
          id: entity._id as Types.ObjectId,
          fullName: formatDoctorName(
            entity.firstName,
            entity.middleName,
            entity.lastName,
          ),
          firstName: entity.firstName as string,
          middleName: entity.middleName as string,
          lastName: entity.lastName as string,
          gender: entity.gender as string | undefined,
          image: entity.image as string | undefined,
          address: entity.address as string | undefined,
          rating: entity.rating as number | undefined,
          bio: entity.bio as string | undefined,
          status: entity.status as string | undefined,
          yearsOfExperience: entity.yearsOfExperience as Date | undefined,
          inspectionPrice: entity.inspectionPrice as number | undefined,
          inspectionDuration: entity.inspectionDuration as number | undefined,
          cityId: entity.cityId as Types.ObjectId | undefined,
          city: entity.city as string | undefined,
          subcity: entity.subcity as string | undefined,
          phones: entity.phones ?? [],
          workingHours: entity.workingHours ?? [],
          hospitals: entity.hospitals ?? [],
          centers: entity.centers ?? [],
          insuranceCompanies: entity.insuranceCompanies ?? [],
          publicSpecializations: pubSpecArray
            .map((s: any) => s?.name as string)
            .filter(Boolean),
          publicSpecialization: pubSpecArray[0]?.name as string | undefined,
          privateSpecializations,
          publicSpecializationStr: entity.publicSpecialization as
            | string
            | undefined,
          privateSpecializationStr: entity.privateSpecialization as
            | string
            | undefined,
        };
        return result;
      }

      // ── Hospital ───────────────────────────────────────────────────────────
      case 'hospital': {
        const result: HospitalNearbyEntity = {
          ...base,
          entityType: 'hospital',
          id: entity._id as Types.ObjectId,
          name: entity.name as string,
          address: entity.address as string,
          bio: entity.bio as string | undefined,
          category: entity.category as string,
          // DB field is 'hospitalstatus' (all lowercase)
          hospitalStatus: entity.hospitalstatus as string,
          hospitalSpecialization: entity.hospitalSpecialization as string,
          // Hospital ApprovalStatus is stored in 'status'
          status: entity.status as string | undefined,
          cityId: entity.cityId as Types.ObjectId,
          phones: entity.phones ?? [],
          image: entity.image as string | undefined,
          rating: entity.rating as number | undefined,
          insuranceCompanies: entity.insuranceCompanies ?? [],
          departments: entity.departments ?? [],
        };
        return result;
      }

      // ── Center ─────────────────────────────────────────────────────────────
      case 'center': {
        const result: CenterNearbyEntity = {
          ...base,
          entityType: 'center',
          id: entity._id as Types.ObjectId,
          name: entity.name as string,
          address: entity.address as string | undefined,
          bio: entity.bio as string | undefined,
          centerSpecialization: entity.centerSpecialization as string,
          // Center uses 'approvalStatus' (not 'status')
          approvalStatus: entity.approvalStatus as string | undefined,
          cityId: entity.cityId as Types.ObjectId,
          phones: entity.phones ?? [],
          image: entity.image as string | undefined,
          rating: entity.rating as number | undefined,
          // workingHours uses { from, to } — NOT startTime/endTime
          workingHours: entity.workingHours ?? [],
          departments: entity.departments ?? [],
        };
        return result;
      }
    }
  }

  /**
   * Builds a response entity using fallback (straight-line) travel estimates
   * when the ORS routing API is unavailable.
   */
  toFallback(
    entity: any,
    travelMode: TravelMode,
    entityType: 'doctor' | 'hospital' | 'center',
  ): NearbyEntity {
    const distanceKm = (entity.straightLineDistance as number) ?? 0;
    const speed = FALLBACK_SPEEDS[travelMode];

    return this.toResponse(
      {
        ...entity,
        distanceKm: Math.round(distanceKm * 100) / 100,
        durationMinutes: Math.round((distanceKm / speed) * 60),
        travelMode,
        routeAvailable: false,
      },
      entityType,
    );
  }
}
