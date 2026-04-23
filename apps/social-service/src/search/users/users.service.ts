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

  /**
   * Invalidate every doctor-related entry in the nearby cache.
   *
   * Two patterns are nuked:
   *   `doctors:*` — the repo-level cache keyed by doctor filters + grid cell
   *   `req:*`     — the service-level composite cache that mixes doctors,
   *                 hospitals and centers. A doctor change may land in any
   *                 grid cell, so we drop all composites rather than guessing.
   *
   * L1 memory is cleared on this pod only; remote pods converge within the
   * 60s in-memory TTL.
   */
  async invalidateDoctorListings(): Promise<void> {
    await Promise.all([
      this.cache.invalidatePattern('doctors:*'),
      this.cache.invalidatePattern('req:*'),
    ]);
    this.logger.log('Doctor nearby cache invalidated');
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
    let _doctorCount = 0,
      _hospitalCount = 0,
      _centerCount = 0;
    const doctors: NearbyEntity[] = [];
    const hospitals: NearbyEntity[] = [];
    const centers: NearbyEntity[] = [];

    // ── 1. Fetch + enrich ────────────────────────────────────────────────────
    if (entityType === 'doctors' || entityType === 'all') {
      const raw = await this.repository.getDoctorsInRadius(
        lat,
        lng,
        radiusKm,
        filters,
      );
      _doctorCount = raw.length;
      if (raw.length) {
        const enriched = await this.routing.enrichWithMatrix(
          raw,
          lat,
          lng,
          travelMode,
          'doctor',
        );
        doctors.push(
          ...enriched.map((e) => this.mapper.toResponse(e, 'doctor')),
        );
      }
    }

    if (entityType === 'hospitals' || entityType === 'all') {
      const raw = await this.repository.getHospitalsInRadius(
        lat,
        lng,
        radiusKm,
        filters,
      );
      _hospitalCount = raw.length;
      if (raw.length) {
        const enriched = await this.routing.enrichWithMatrix(
          raw,
          lat,
          lng,
          travelMode,
          'hospital',
        );
        hospitals.push(
          ...enriched.map((e) => this.mapper.toResponse(e, 'hospital')),
        );
      }
    }

    if (entityType === 'centers' || entityType === 'all') {
      const raw = await this.repository.getCentersInRadius(
        lat,
        lng,
        radiusKm,
        filters,
      );
      _centerCount = raw.length;
      if (raw.length) {
        const enriched = await this.routing.enrichWithMatrix(
          raw,
          lat,
          lng,
          travelMode,
          'center',
        );
        centers.push(
          ...enriched.map((e) => this.mapper.toResponse(e, 'center')),
        );
      }
    }

    const total = doctors.length + hospitals.length + centers.length;
    if (!total) return this.emptyResponse(page, limit);

    // ── 2. Sort each group by travel time ────────────────────────────────────
    doctors.sort((a, b) => a.durationMinutes - b.durationMinutes);
    hospitals.sort((a, b) => a.durationMinutes - b.durationMinutes);
    centers.sort((a, b) => a.durationMinutes - b.durationMinutes);

    // ── 3. Paginate each group ───────────────────────────────────────────────
    const skip = (page - 1) * limit;
    let doctorPage = doctors.slice(skip, skip + limit);
    let hospitalPage = hospitals.slice(skip, skip + limit);
    let centerPage = centers.slice(skip, skip + limit);

    // ── 4. Optionally attach turn-by-turn routes ─────────────────────────────
    // Best-effort: if ORS is slow (common from low-bandwidth regions), return
    // the entity list without `route` rather than blowing the gateway timeout.
    // The slow ORS responses still complete and populate Redis via NearbyCache,
    // so the next request hits the warm cache.
    if (includeRoutes) {
      const ROUTE_BUDGET_MS = 8000;
      const TIMEOUT = Symbol('routes-budget');
      const budget = new Promise<typeof TIMEOUT>((resolve) =>
        setTimeout(() => resolve(TIMEOUT), ROUTE_BUDGET_MS),
      );

      const enrichAll = Promise.all([
        doctorPage.length
          ? this.routing.loadRoutesInParallel(doctorPage, lat, lng, travelMode)
          : Promise.resolve(doctorPage),
        hospitalPage.length
          ? this.routing.loadRoutesInParallel(
              hospitalPage,
              lat,
              lng,
              travelMode,
            )
          : Promise.resolve(hospitalPage),
        centerPage.length
          ? this.routing.loadRoutesInParallel(centerPage, lat, lng, travelMode)
          : Promise.resolve(centerPage),
      ]);

      const result = await Promise.race([enrichAll, budget]);
      if (result === TIMEOUT) {
        this.logger.warn(
          `Route enrichment exceeded ${ROUTE_BUDGET_MS}ms — responding without routes; queued for warmup`,
        );
        void this.routing.queueCacheWarmup(
          [...doctorPage, ...hospitalPage, ...centerPage],
          lat,
          lng,
          travelMode,
        );
      } else {
        [doctorPage, hospitalPage, centerPage] = result;
      }

      // Warm-up next page in the background (fire-and-forget)
      const allSorted = [...doctors, ...hospitals, ...centers];
      void this.routing.queueCacheWarmup(
        allSorted.slice(skip + limit, skip + limit + 10),
        lat,
        lng,
        travelMode,
      );
    }

    this.logger.log(`findNearbyEntities: ${Date.now() - startTime}ms`);

    const totalPages = Math.ceil(total / limit);

    return {
      doctors: { data: doctorPage, total: doctors.length },
      hospitals: { data: hospitalPage, total: hospitals.length },
      centers: { data: centerPage, total: centers.length },
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
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
      doctors: { data: [], total: 0 },
      hospitals: { data: [], total: 0 },
      centers: { data: [], total: 0 },
      meta: {
        total: 0,
        page,
        limit,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
  }
}
