import { Controller, Get, Query } from '@nestjs/common';
import { GetNearbyDoctorsHospitalsDto } from './dto/find_nearby_entity.dto';
import { UserService } from './users.service';
import type { NearbyFilters } from './types/nearby.types';

/**
 * Controller entry-point for the nearby search feature.
 *
 * HOW LOCATION WORKS
 * ──────────────────
 * The client is responsible for obtaining (lat, lng) and sending it as
 * `customerLat` / `customerLng` query params.  Two UX flows are supported:
 *
 *  1. Auto-detect  – the frontend calls `navigator.geolocation.getCurrentPosition()`
 *     and passes the result directly.
 *
 *  2. Map picker   – the user taps/drags a pin on an interactive map; the pin
 *     coordinates are sent in the same fields.
 *
 * Both flows hit the same endpoint, so the backend is location-source agnostic.
 */
@Controller('nearby')
export class NearbyController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async findNearby(@Query() dto: GetNearbyDoctorsHospitalsDto) {
    // ── Map DTO fields → NearbyFilters ──────────────────────────────────────
    const filters: NearbyFilters = {
      // Shared
      cityId: dto.cityId,

      // Doctor
      doctorName: dto.doctorName,
      publicSpecialization: dto.publicSpecialization,
      privateSpecializations: dto.privateSpecializations,
      gender: dto.gender,
      minPrice: dto.minPrice,
      maxPrice: dto.maxPrice,
      minRating: dto.minRating,
      maxRating: dto.maxRating,

      // Hospital
      hospitalName: dto.hospitalName,
      hospitalCategory: dto.hospitalCategory,
      hospitalStatus: dto.hospitalStatus,
      hospitalSpecialization: dto.hospitalSpecialization,

      // Center
      centerSpecialization: dto.centerSpecialization,
      centerName: dto.centerName,

      // Dept / ops / machines (all entity types)
      departments: dto.departments,
      operations: dto.operations,
      machines: dto.machines,
    };

    return this.userService.findNearbyEntities(
      dto.customerLat,
      dto.customerLng,
      dto.radiusKm,
      dto.page ?? 1,
      dto.limit ?? 10,
      dto.mode ?? 'driving-car',
      dto.includeRoutes ?? false,
      dto.entityType ?? 'all',
      filters,
    );
  }
}
