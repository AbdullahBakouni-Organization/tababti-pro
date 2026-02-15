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
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    if (req.path.includes('/api/v1/search') && req.method === 'GET') {
      const originalSend = res.send.bind(res);

      res.send = (body: any) => {
        try {
          const data = typeof body === 'string' ? JSON.parse(body) : body;

          if (data?.doctors?.data?.length) {
            const doctorIds = data.doctors.data.map((d) => d._id);
            this.doctorModel
              .updateMany(
                { _id: { $in: doctorIds.map((id) => new Types.ObjectId(id)) } },
                { $inc: { searchCount: 1 } },
              )
              .catch((err) =>
                console.error('Failed to increment doctor searchCount', err),
              );
          }

          if (data?.hospitals?.data?.length) {
            const hospitalIds = data.hospitals.data.map((h) => h._id);
            this.hospitalModel
              .updateMany(
                {
                  _id: { $in: hospitalIds.map((id) => new Types.ObjectId(id)) },
                },
                { $inc: { searchCount: 1 } },
              )
              .catch((err) =>
                console.error('Failed to increment hospital searchCount', err),
              );
          }

          if (data?.centers?.data?.length) {
            const centerIds = data.centers.data.map((c) => c._id);
            this.centerModel
              .updateMany(
                { _id: { $in: centerIds.map((id) => new Types.ObjectId(id)) } },
                { $inc: { searchCount: 1 } },
              )
              .catch((err) =>
                console.error('Failed to increment center searchCount', err),
              );
          }
        } catch (err) {
          console.error('Failed to process searchCount middleware', err);
        }

        return originalSend(body);
      };
    }

    next();
  }
}
