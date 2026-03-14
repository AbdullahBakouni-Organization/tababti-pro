import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';

import { calculateDistanceKm } from '../../common/utiles/distance.util';
import { NearbyCache } from './nearby-cache.service';
import {
  TravelMode,
  FALLBACK_SPEEDS,
  NearbyEntity,
} from './types/nearby.types';
import {
  MatrixResponse,
  RouteData,
  RouteSegment,
  OpenRouteServiceDirectionsResponse,
  ORSGeoJsonResponse,
} from '../../common/interfaces/users.interface';

const TTL_MATRIX = 3600;
const TTL_ROUTE = 86400;
const MATRIX_BATCH = 50;
const MAX_CONCURRENT = 5;
const ORS_API_BASE = 'https://api.openrouteservice.org/v2';

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);
  private readonly requestQueue: Promise<any>[] = [];

  constructor(
    private readonly cache: NearbyCache,
    @InjectQueue('route-processing') private readonly routeQueue: Queue,
    @InjectQueue('matrix-processing') private readonly matrixQueue: Queue,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // MATRIX ENRICHMENT
  // ═══════════════════════════════════════════════════════════════════════════

  async enrichWithMatrix(
    entities: any[],
    lat: number,
    lng: number,
    travelMode: TravelMode,
    entityType: 'doctor' | 'hospital' | 'center',
  ): Promise<any[]> {
    const results: any[] = [];

    for (let i = 0; i < entities.length; i += MATRIX_BATCH) {
      const batch = entities.slice(i, i + MATRIX_BATCH);
      const batchResults = await this.processMatrixBatch(
        batch,
        lat,
        lng,
        travelMode,
        entityType,
      );
      results.push(...batchResults);
    }

    return results;
  }

  private async processMatrixBatch(
    entities: any[],
    lat: number,
    lng: number,
    travelMode: TravelMode,
    entityType: 'doctor' | 'hospital' | 'center',
  ): Promise<any[]> {
    const destinations = entities
      .map((e) => `${e.latitude},${e.longitude}`)
      .join('|');
    const gridKey = this.cache.gridKey(lat, lng, `matrix-${entityType}`, 10);
    const cacheKey = `${gridKey}:${travelMode}:${Buffer.from(destinations).toString('base64').slice(0, 32)}`;

    const matrix = await this.cache.get(
      cacheKey,
      async () => {
        await this.queueMatrix(lat, lng, entities, travelMode, cacheKey);
        return this.callMatrixAPI(lat, lng, entities, travelMode);
      },
      TTL_MATRIX,
    );

    return this.mapMatrixToEntities(entities, matrix, travelMode, entityType);
  }

  private mapMatrixToEntities(
    entities: any[],
    matrix: MatrixResponse,
    travelMode: TravelMode,
    entityType: 'doctor' | 'hospital' | 'center',
  ): any[] {
    const durations = matrix.durations?.[0] ?? [];
    const distances = matrix.distances?.[0] ?? [];

    return entities.map((entity, i) => {
      const duration = durations[i];
      const distance = distances[i];

      if (duration != null && distance != null) {
        const multiplier = this.trafficMultiplier(travelMode, distance);
        return {
          ...entity,
          distanceKm: Math.round(distance * 100) / 100,
          durationMinutes: Math.round((duration * multiplier) / 60),
          travelMode,
          routeAvailable: true,
        };
      }

      return this.applyFallbackRouting(entity, travelMode);
    });
  }

  private applyFallbackRouting(entity: any, travelMode: TravelMode): any {
    const distanceKm = entity.straightLineDistance ?? 0;
    const speed = FALLBACK_SPEEDS[travelMode];
    return {
      ...entity,
      distanceKm: Math.round(distanceKm * 100) / 100,
      durationMinutes: Math.round((distanceKm / speed) * 60),
      travelMode,
      routeAvailable: true,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DETAILED ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  async loadRoutesInParallel(
    entities: NearbyEntity[],
    lat: number,
    lng: number,
    travelMode: TravelMode,
  ): Promise<NearbyEntity[]> {
    const results: NearbyEntity[] = [];

    for (let i = 0; i < entities.length; i += MAX_CONCURRENT) {
      const chunk = entities.slice(i, i + MAX_CONCURRENT);
      const chunkResults = await Promise.all(
        chunk.map((e) => this.loadOneRoute(e, lat, lng, travelMode)),
      );
      results.push(...chunkResults);
    }

    return results;
  }

  private async loadOneRoute(
    entity: NearbyEntity,
    lat: number,
    lng: number,
    travelMode: TravelMode,
  ): Promise<NearbyEntity> {
    try {
      const route = await this.getDetailedRoute(
        lat,
        lng,
        entity.latitude,
        entity.longitude,
        travelMode,
      );
      return { ...entity, route };
    } catch (error) {
      this.logger.error(`Route failed for entity ${entity.id}:`, error);
      return entity;
    }
  }

  private async getDetailedRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
    profile: TravelMode,
  ): Promise<RouteData> {
    const originKey = this.cache.gridKey(originLat, originLng, 'route', 1);
    const cacheKey = `${originKey}:${destLat.toFixed(6)},${destLng.toFixed(6)}:${profile}`;

    return this.cache.get(
      cacheKey,
      async () => {
        await this.queueRoute(
          originLat,
          originLng,
          destLat,
          destLng,
          profile,
          cacheKey,
        );
        const orsData = await this.callDirectionsAPI(
          originLat,
          originLng,
          destLat,
          destLng,
          profile,
        );
        return this.processRouteData(
          orsData,
          originLat,
          originLng,
          destLat,
          destLng,
          profile,
        );
      },
      TTL_ROUTE,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ORS HTTP CALLS
  // ═══════════════════════════════════════════════════════════════════════════

  private async callMatrixAPI(
    originLat: number,
    originLng: number,
    entities: any[],
    profile: TravelMode,
  ): Promise<MatrixResponse> {
    const apiKey = process.env.OPENROUTE_API_KEY;
    if (!apiKey)
      return this.fallbackMatrix(entities, originLat, originLng, profile);

    try {
      const locations = [
        [originLng, originLat],
        ...entities.map((e) => [e.longitude, e.latitude]),
      ];

      const res = await this.rateLimitedFetch(
        `${ORS_API_BASE}/matrix/${profile}`,
        {
          method: 'POST',
          headers: {
            Authorization: apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            locations,
            sources: [0],
            destinations: Array.from(
              { length: entities.length },
              (_, i) => i + 1,
            ),
            metrics: ['distance', 'duration'],
            units: 'km',
          }),
        },
      );

      if (!res.ok) throw new Error(`Matrix API ${res.status}`);
      return (await res.json()) as MatrixResponse;
    } catch (error) {
      this.logger.error('Matrix API error:', error);
      return this.fallbackMatrix(entities, originLat, originLng, profile);
    }
  }

  private async callDirectionsAPI(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
    profile: TravelMode,
  ): Promise<OpenRouteServiceDirectionsResponse | null> {
    const apiKey = process.env.OPENROUTE_API_KEY;
    if (!apiKey) return null;

    try {
      const res = await this.rateLimitedFetch(
        `${ORS_API_BASE}/directions/${profile}/geojson`,
        {
          method: 'POST',
          headers: {
            Authorization: apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/geo+json',
          },
          body: JSON.stringify({
            coordinates: [
              [originLng, originLat],
              [destLng, destLat],
            ],
            instructions: true,
            units: 'km',
            preference: 'recommended',
            geometry_simplify: true,
          }),
        },
      );

      if (!res.ok) throw new Error(`Directions API ${res.status}`);

      const data = (await res.json()) as ORSGeoJsonResponse;
      if (!data?.features) throw new Error('Invalid ORS response');

      return {
        routes: data.features.map((f) => {
          if (f.geometry.type !== 'LineString')
            throw new Error('Unexpected geometry');
          return {
            summary: {
              distance: (f.properties?.summary?.distance ?? 0) * 1000,
              duration: f.properties?.summary?.duration ?? 0,
            },
            geometry: {
              type: f.geometry.type,
              coordinates: f.geometry.coordinates,
            },
            segments: f.properties?.segments ?? [],
          };
        }),
      };
    } catch (error) {
      this.logger.error('Directions API error:', error);
      return null;
    }
  }

  private processRouteData(
    orsData: OpenRouteServiceDirectionsResponse | null,
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
    profile: TravelMode,
  ): RouteData {
    if (!orsData?.routes?.length) {
      return this.fallbackRoute(
        originLat,
        originLng,
        destLat,
        destLng,
        profile,
      );
    }

    const route = orsData.routes[0];
    const distanceKm = route.summary.distance / 1000;
    const multiplier = this.trafficMultiplier(profile, distanceKm);
    const duration = route.summary.duration * multiplier;

    const segments: RouteSegment[] = (route.segments ?? []).flatMap((seg) =>
      (seg.steps ?? []).map((step) => ({
        distance: step.distance,
        duration: step.duration * multiplier,
        instruction: step.instruction,
        name: step.name || 'Unnamed road',
        type: step.type,
      })),
    );

    const coordinates = route.geometry.coordinates.filter(
      (_, i) =>
        i === 0 || i === route.geometry.coordinates.length - 1 || i % 3 === 0,
    );

    return {
      geometry: { type: 'LineString', coordinates },
      segments,
      summary: {
        distance: route.summary.distance,
        duration,
        distanceText: `${distanceKm.toFixed(1)} km`,
        durationText: this.formatDuration(Math.round(duration / 60)),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUEUE JOBS
  // ═══════════════════════════════════════════════════════════════════════════

  private async queueMatrix(
    originLat: number,
    originLng: number,
    entities: any[],
    profile: TravelMode,
    cacheKey: string,
  ): Promise<void> {
    try {
      await this.matrixQueue.add(
        'calculate-matrix',
        {
          originLat,
          originLng,
          entities: entities.map((e) => ({
            latitude: e.latitude,
            longitude: e.longitude,
            id: e._id,
          })),
          profile,
          cacheKey,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
        },
      );
    } catch {
      this.logger.warn('Matrix queue unavailable');
    }
  }

  private async queueRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
    profile: TravelMode,
    cacheKey: string,
  ): Promise<void> {
    try {
      await this.routeQueue.add(
        'calculate-route',
        { originLat, originLng, destLat, destLng, profile, cacheKey },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
        },
      );
    } catch {
      this.logger.warn('Route queue unavailable');
    }
  }

  async queueCacheWarmup(
    entities: NearbyEntity[],
    lat: number,
    lng: number,
    travelMode: TravelMode,
  ): Promise<void> {
    if (!entities.length) return;
    try {
      await this.routeQueue.add(
        'warmup-routes',
        {
          entities: entities.slice(0, 5).map((e) => ({
            id: e.id,
            latitude: e.latitude,
            longitude: e.longitude,
          })),
          customerLat: lat,
          customerLng: lng,
          travelMode,
        },
        { delay: 1000, attempts: 2, removeOnComplete: true },
      );
    } catch {
      this.logger.warn('Warmup queue unavailable');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  trafficMultiplier(travelMode: TravelMode, distanceKm: number): number {
    if (travelMode === 'foot-walking' || travelMode === 'cycling-regular')
      return 1.0;

    const now = new Date();
    const hour = now.getHours();
    const isUrban = distanceKm <= 12;
    const isFri = now.getDay() === 5;

    let base: number;
    if (isFri) {
      if (hour >= 7 && hour <= 10) base = 1.4;
      else if (hour >= 12 && hour <= 15) base = 1.2;
      else if (hour >= 16 && hour <= 20) base = 2.2;
      else base = 1.3;
    } else {
      if (hour >= 7 && hour <= 9) base = 2.3;
      else if (hour >= 10 && hour <= 14) base = 1.8;
      else if (hour >= 15 && hour <= 19) base = 2.6;
      else if (hour >= 20 && hour <= 22) base = 1.9;
      else base = 1.3;
    }

    return (
      base * (isUrban ? 1.35 : 1.0) * (isUrban && distanceKm < 6 ? 1.15 : 1.0)
    );
  }

  private fallbackMatrix(
    entities: any[],
    originLat: number,
    originLng: number,
    profile: TravelMode,
  ): MatrixResponse {
    const speed = FALLBACK_SPEEDS[profile];
    const durations: number[][] = [[]];
    const distances: number[][] = [[]];

    for (const e of entities) {
      const d = calculateDistanceKm(
        originLat,
        originLng,
        e.latitude,
        e.longitude,
      );
      distances[0].push(d);
      durations[0].push((d / speed) * 3600);
    }

    return { durations, distances };
  }

  private fallbackRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
    profile: TravelMode,
  ): RouteData {
    const distance = calculateDistanceKm(
      originLat,
      originLng,
      destLat,
      destLng,
    );
    const speed = FALLBACK_SPEEDS[profile];
    const duration = (distance / speed) * 3600;

    return {
      geometry: {
        type: 'LineString',
        coordinates: [
          [originLng, originLat],
          [destLng, destLat],
        ],
      },
      segments: [
        {
          distance: distance * 1000,
          duration,
          instruction: 'Head towards destination (estimated route)',
          name: 'Direct route',
          type: 11,
        },
      ],
      summary: {
        distance: distance * 1000,
        duration,
        distanceText: `${distance.toFixed(1)} km`,
        durationText: this.formatDuration(Math.round(duration / 60)),
      },
    };
  }

  private async rateLimitedFetch(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    while (this.requestQueue.length >= MAX_CONCURRENT) {
      await Promise.race(this.requestQueue);
    }
    const promise = fetch(url, options).finally(() => {
      const i = this.requestQueue.indexOf(promise);
      if (i > -1) this.requestQueue.splice(i, 1);
    });
    this.requestQueue.push(promise);
    return promise;
  }

  formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
}
