import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Types, Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Hospital } from '@app/common/database/schemas/hospital.schema';
import { Center } from '@app/common/database/schemas/center.schema';

@Injectable()
export class SearchCountMiddleware implements NestMiddleware {
  constructor(
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(Hospital.name) private readonly hospitalModel: Model<Hospital>,
    @InjectModel(Center.name) private readonly centerModel: Model<Center>,
  ) { }

  use(req: Request, res: Response, next: NextFunction) {
    console.log(`🔥 [Middleware HIT] ${req.method} ${req.originalUrl}`);

    const originalJson = res.json.bind(res);

    res.json = (body: any): Response => {
      (async () => {
        try {
          console.log('[Middleware] Parsing response body...');
          const data = typeof body === 'string' ? JSON.parse(body) : body;

          const updatePromises: Promise<any>[] = [];

          // ===== Doctors =====
          if (data?.doctors?.data?.length) {
            const doctorIds = data.doctors.data
              .map((d: { _id: any }) => d._id)
              .filter(Boolean)
              .map((id: string) => new Types.ObjectId(id));

            console.log(`[Middleware] Doctors found: ${doctorIds.length}`);

            updatePromises.push(
              this.doctorModel.updateMany(
                { _id: { $in: doctorIds } },
                { $inc: { searchCount: 1 } },
              ),
            );
          }

          // ===== Hospitals =====
          if (data?.hospitals?.data?.length) {
            const hospitalIds = data.hospitals.data
              .map((h: { _id: any }) => h._id)
              .filter(Boolean)
              .map((id: string) => new Types.ObjectId(id));

            console.log(`[Middleware] Hospitals found: ${hospitalIds.length}`);

            updatePromises.push(
              this.hospitalModel.updateMany(
                { _id: { $in: hospitalIds } },
                { $inc: { searchCount: 1 } },
              ),
            );
          }

          // ===== Centers =====
          if (data?.centers?.data?.length) {
            const centerIds = data.centers.data
              .map((c: { _id: any }) => c._id)
              .filter(Boolean)
              .map((id: string) => new Types.ObjectId(id));

            console.log(`[Middleware] Centers found: ${centerIds.length}`);

            updatePromises.push(
              this.centerModel.updateMany(
                { _id: { $in: centerIds } },
                { $inc: { searchCount: 1 } },
              ),
            );
          }

          if (updatePromises.length) {
            console.log('[Middleware] Updating searchCount...');
            await Promise.all(updatePromises);
            console.log('✅ [Middleware] searchCount updated');
          } else {
            console.log('[Middleware] Nothing to update');
          }
        } catch (err) {
          console.error('❌ Middleware error:', err);
        }
      })();

      return originalJson(body);
    };

    next();
  }
}
