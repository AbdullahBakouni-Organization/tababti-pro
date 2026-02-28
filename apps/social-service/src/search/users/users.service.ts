import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { NearbyRepository } from './nearby-repository.service';
import { RoutingService } from './routing.service';
import { EntityMapper } from './entity-mapper.service';
import { NearbyCache } from './nearby-cache.service';
import type { NearbyFilters, TravelMode } from './types/nearby.types';
import type {
  NearbyEntity,
  PaginatedNearbyResponse,
} from '../../common/interfaces/users.interface';

@Injectable()
export class UserService implements OnModuleInit {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly repository: NearbyRepository,
    private readonly routing: RoutingService,
    private readonly mapper: EntityMapper,
    private readonly cache: NearbyCache,
  ) {}

  onModuleInit() {
    this.logger.log('UserService initialized');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  async findNearbyEntities(
    customerLat: number,
    customerLng: number,
    radiusKm: number,
    page: number,
    limit: number,
    travelMode: TravelMode = 'driving-car',
    includeRoutes: boolean = false,
    entityType: 'doctors' | 'hospitals' | 'centers' | 'all' = 'all',
    filters: NearbyFilters = {},
  ): Promise<PaginatedNearbyResponse> {
    const startTime = Date.now();

    const cacheKey = this.buildRequestKey(
      customerLat,
      customerLng,
      radiusKm,
      page,
      limit,
      travelMode,
      includeRoutes,
      entityType,
      filters,
    );

    return this.cache.get(
      cacheKey,
      () =>
        this.executeFind(
          customerLat,
          customerLng,
          radiusKm,
          page,
          limit,
          travelMode,
          includeRoutes,
          entityType,
          filters,
          startTime,
        ),
      60, // 60s TTL for paginated responses
    );
  }

  getTravelModes(): TravelMode[] {
    return ['driving-car', 'driving-hgv', 'foot-walking', 'cycling-regular'];
  }

  // ─── Cache invalidation ───────────────────────────────────────────────────

  async invalidateDoctorCache(): Promise<void> {
    await this.cache.del('doctors:all');
    this.cache.clearMemory();
    this.logger.log('Doctor cache invalidated');
  }

  invalidateHospitalCache(): void {
    this.cache.clearMemory();
    this.logger.log('Hospital cache invalidated');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE SEARCH
  // ═══════════════════════════════════════════════════════════════════════════

  private async executeFind(
    lat: number,
    lng: number,
    radiusKm: number,
    page: number,
    limit: number,
    travelMode: TravelMode,
    includeRoutes: boolean,
    entityType: string,
    filters: NearbyFilters,
    startTime: number,
  ): Promise<PaginatedNearbyResponse> {
    const all: NearbyEntity[] = [];
    let doctorCount = 0,
      hospitalCount = 0,
      centerCount = 0;

    // ── 1. Fetch raw docs from DB (each call is individually cached) ─────────
    if (entityType === 'doctors' || entityType === 'all') {
      const raw = await this.repository.getDoctorsInRadius(
        lat,
        lng,
        radiusKm,
        filters,
      );
      doctorCount = raw.length;
      if (raw.length) {
        const enriched = await this.routing.enrichWithMatrix(
          raw,
          lat,
          lng,
          travelMode,
          'doctor',
        );
        all.push(...enriched.map((e) => this.mapper.toResponse(e, 'doctor')));
      }
    }

    if (entityType === 'hospitals' || entityType === 'all') {
      const raw = await this.repository.getHospitalsInRadius(
        lat,
        lng,
        radiusKm,
        filters,
      );
      hospitalCount = raw.length;
      if (raw.length) {
        const enriched = await this.routing.enrichWithMatrix(
          raw,
          lat,
          lng,
          travelMode,
          'hospital',
        );
        all.push(...enriched.map((e) => this.mapper.toResponse(e, 'hospital')));
      }
    }

    if (entityType === 'centers' || entityType === 'all') {
      const raw = await this.repository.getCentersInRadius(
        lat,
        lng,
        radiusKm,
        filters,
      );
      centerCount = raw.length;
      if (raw.length) {
        const enriched = await this.routing.enrichWithMatrix(
          raw,
          lat,
          lng,
          travelMode,
          'center',
        );
        all.push(...enriched.map((e) => this.mapper.toResponse(e, 'center')));
      }
    }

    if (!all.length) return this.emptyResponse(page, limit);

    // ── 2. Sort by travel time (ascending) ───────────────────────────────────
    all.sort((a, b) => a.durationMinutes - b.durationMinutes);

    // ── 3. Paginate ──────────────────────────────────────────────────────────
    const total = all.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const pageSlice = all.slice(skip, skip + limit);

    // ── 4. Optionally attach turn-by-turn routes ─────────────────────────────
    let finalEntities = pageSlice;

    if (includeRoutes) {
      finalEntities = await this.routing.loadRoutesInParallel(
        pageSlice,
        lat,
        lng,
        travelMode,
      );

      // Warm-up next page in the background (fire-and-forget)
      void this.routing.queueCacheWarmup(
        all.slice(skip + limit, skip + limit + 10),
        lat,
        lng,
        travelMode,
      );
    }

    this.logger.log(`findNearbyEntities: ${Date.now() - startTime}ms`);

    return {
      data: finalEntities,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        counts: {
          doctors: doctorCount,
          hospitals: hospitalCount,
          centers: centerCount,
        },
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private buildRequestKey(
    lat: number,
    lng: number,
    radius: number,
    page: number,
    limit: number,
    travelMode: TravelMode,
    includeRoute: boolean,
    entityType: string,
    filters: NearbyFilters,
  ): string {
    const grid = this.cache.gridKey(lat, lng, 'req', 10);
    const parts: string[] = [];

    // Shared
    if (filters.cityId) parts.push(`city:${filters.cityId}`);

    // Doctor
    if (filters.doctorName) parts.push(`dn:${filters.doctorName}`);
    if (filters.publicSpecialization)
      parts.push(`pub:${filters.publicSpecialization}`);
    if (filters.privateSpecializations?.length)
      parts.push(
        `priv:${[...filters.privateSpecializations].sort().join(',')}`,
      );
    if (filters.gender) parts.push(`g:${filters.gender}`);
    if (filters.minPrice != null) parts.push(`minP:${filters.minPrice}`);
    if (filters.maxPrice != null) parts.push(`maxP:${filters.maxPrice}`);
    if (filters.minRating != null) parts.push(`minR:${filters.minRating}`);
    if (filters.maxRating != null) parts.push(`maxR:${filters.maxRating}`);

    // Hospital
    if (filters.hospitalName) parts.push(`hn:${filters.hospitalName}`);
    if (filters.hospitalCategory) parts.push(`hc:${filters.hospitalCategory}`);
    if (filters.hospitalStatus) parts.push(`hs:${filters.hospitalStatus}`);
    if (filters.hospitalSpecialization)
      parts.push(`hsp:${filters.hospitalSpecialization}`);

    // Center
    if (filters.centerSpecialization)
      parts.push(`csp:${filters.centerSpecialization}`);
    if (filters.centerName) parts.push(`cn:${filters.centerName}`);

    // Dept / ops / machines
    if (filters.departments?.length)
      parts.push(`dep:${[...filters.departments].sort().join(',')}`);
    if (filters.operations?.length)
      parts.push(`op:${[...filters.operations].sort().join(',')}`);
    if (filters.machines?.length)
      parts.push(`mc:${[...filters.machines].sort().join(',')}`);

    return `${grid}:r${radius}:p${page}:l${limit}:${travelMode}:rt${includeRoute}:${entityType}:${
      parts.join('|') || 'none'
    }`;
  }

  private emptyResponse(page: number, limit: number): PaginatedNearbyResponse {
    return {
      data: [],
      meta: {
        total: 0,
        page,
        limit,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
        counts: { doctors: 0, hospitals: 0, centers: 0 },
      },
    };
  }
}
