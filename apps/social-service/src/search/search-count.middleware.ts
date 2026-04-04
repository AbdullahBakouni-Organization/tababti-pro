import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Types, Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Hospital } from '@app/common/database/schemas/hospital.schema';
import { Center } from '@app/common/database/schemas/center.schema';

@Injectable()
export class SearchCountMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SearchCountMiddleware.name);

  constructor(
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(Hospital.name) private readonly hospitalModel: Model<Hospital>,
    @InjectModel(Center.name) private readonly centerModel: Model<Center>,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    this.logger.debug(`[Middleware HIT] ${req.method} ${req.originalUrl}`);

    const originalJson = res.json.bind(res);

    res.json = (body: unknown): Response => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      (async () => {
        try {
          const data = typeof body === 'string' ? JSON.parse(body) : body;

          const updatePromises: Promise<unknown>[] = [];

          // ===== Doctors =====
          if (
            (data as { doctors?: { data?: { _id: unknown }[] } })?.doctors?.data
              ?.length
          ) {
            const doctorIds = (
              data as { doctors: { data: { _id: string }[] } }
            ).doctors.data
              .map((d) => d._id)
              .filter(Boolean)
              .map((id) => new Types.ObjectId(id));

            this.logger.debug(
              `[Middleware] Doctors found: ${doctorIds.length}`,
            );

            updatePromises.push(
              this.doctorModel.updateMany(
                { _id: { $in: doctorIds } },
                { $inc: { searchCount: 1 } },
              ),
            );
          }

          // ===== Hospitals =====
          if (
            (data as { hospitals?: { data?: { _id: unknown }[] } })?.hospitals
              ?.data?.length
          ) {
            const hospitalIds = (
              data as { hospitals: { data: { _id: string }[] } }
            ).hospitals.data
              .map((h) => h._id)
              .filter(Boolean)
              .map((id) => new Types.ObjectId(id));

            this.logger.debug(
              `[Middleware] Hospitals found: ${hospitalIds.length}`,
            );

            updatePromises.push(
              this.hospitalModel.updateMany(
                { _id: { $in: hospitalIds } },
                { $inc: { searchCount: 1 } },
              ),
            );
          }

          // ===== Centers =====
          if (
            (data as { centers?: { data?: { _id: unknown }[] } })?.centers?.data
              ?.length
          ) {
            const centerIds = (
              data as { centers: { data: { _id: string }[] } }
            ).centers.data
              .map((c) => c._id)
              .filter(Boolean)
              .map((id) => new Types.ObjectId(id));

            this.logger.debug(
              `[Middleware] Centers found: ${centerIds.length}`,
            );

            updatePromises.push(
              this.centerModel.updateMany(
                { _id: { $in: centerIds } },
                { $inc: { searchCount: 1 } },
              ),
            );
          }

          if (updatePromises.length) {
            await Promise.all(updatePromises);
            this.logger.debug('[Middleware] searchCount updated');
          }
        } catch (err) {
          this.logger.error('[Middleware] Error updating searchCount', err);
        }
      })();

      return originalJson(body);
    };

    next();
  }
}
