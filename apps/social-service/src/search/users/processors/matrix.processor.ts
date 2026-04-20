import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';

import { RoutingService } from '../routing.service';
import type { TravelMode } from '../types/nearby.types';

interface MatrixJobData {
  originLat: number;
  originLng: number;
  entities: Array<{ latitude: number; longitude: number; id?: unknown }>;
  profile: TravelMode;
  cacheKey: string;
}

@Processor('matrix-processing')
export class MatrixProcessor {
  private readonly logger = new Logger(MatrixProcessor.name);

  constructor(private readonly routing: RoutingService) {}

  @Process('calculate-matrix')
  async handleCalculate(job: Job<MatrixJobData>): Promise<void> {
    const { originLat, originLng, entities, profile, cacheKey } = job.data;
    try {
      await this.routing.runMatrixJob(
        originLat,
        originLng,
        entities,
        profile,
        cacheKey,
      );
    } catch (error) {
      this.logger.error(
        `calculate-matrix job ${job.id} failed`,
        (error as Error).message,
      );
      throw error;
    }
  }
}
