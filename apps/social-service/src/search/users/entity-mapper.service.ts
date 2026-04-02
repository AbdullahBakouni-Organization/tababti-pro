import { Injectable } from '@nestjs/common';
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
      case 'doctor': {
        const _pubSpecArray: any[] = Array.isArray(
          entity.publicSpecializationId,
        )
          ? entity.publicSpecializationId
          : entity.publicSpecializationId
            ? [entity.publicSpecializationId]
            : [];

        // privateSpecializationId → populated SINGLE object (or array edge-case)
        const privSpec = entity.privateSpecializationId;
        const _privateSpecializations: string[] = privSpec
          ? Array.isArray(privSpec)
            ? privSpec.map((s: any) => s?.name).filter(Boolean)
            : privSpec?.name
              ? [privSpec.name]
              : []
          : [];

        return {
          ...base,
          entityType: 'doctor',
          id: entity._id,
          fullName: formatDoctorName(
            entity.firstName,
            entity.middleName,
            entity.lastName,
          ),
          image: entity.image as string | undefined,
          publicSpecializationStr: entity.publicSpecialization as
            | string
            | undefined,
          privateSpecializationStr: entity.privateSpecialization as
            | string
            | undefined,
        } as DoctorNearbyEntity;
      }

      case 'hospital': {
        return {
          ...base,
          entityType: 'hospital',
          id: entity._id,
          name: entity.name as string,
          image: entity.image as string | undefined,
          hospitalSpecialization: entity.hospitalSpecialization as string,
        } as HospitalNearbyEntity;
      }

      case 'center': {
        return {
          ...base,
          entityType: 'center',
          id: entity._id,
          name: entity.name as string,
          image: entity.image as string | undefined,
          centerSpecialization: entity.centerSpecialization as string,
        } as CenterNearbyEntity;
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
