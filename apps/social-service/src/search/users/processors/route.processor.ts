import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';

import { RoutingService } from '../routing.service';
import type { TravelMode } from '../types/nearby.types';

interface RouteJobData {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  profile: TravelMode;
  cacheKey: string;
}

interface WarmupJobData {
  entities: Array<{ id?: unknown; latitude: number; longitude: number }>;
  customerLat: number;
  customerLng: number;
  travelMode: TravelMode;
}

@Processor('route-processing')
export class RouteProcessor {
  private readonly logger = new Logger(RouteProcessor.name);

  constructor(private readonly routing: RoutingService) {}

  @Process('calculate-route')
  async handleCalculate(job: Job<RouteJobData>): Promise<void> {
    const { originLat, originLng, destLat, destLng, profile, cacheKey } =
      job.data;
    try {
      await this.routing.runRouteJob(
        originLat,
        originLng,
        destLat,
        destLng,
        profile,
        cacheKey,
      );
    } catch (error) {
      this.logger.error(
        `calculate-route job ${job.id} failed`,
        (error as Error).message,
      );
      throw error;
    }
  }

  @Process('warmup-routes')
  async handleWarmup(job: Job<WarmupJobData>): Promise<void> {
    const { entities, customerLat, customerLng, travelMode } = job.data;
    try {
      await this.routing.runWarmupJob(
        entities,
        customerLat,
        customerLng,
        travelMode,
      );
    } catch (error) {
      this.logger.error(
        `warmup-routes job ${job.id} failed`,
        (error as Error).message,
      );
      throw error;
    }
  }
}
