import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SearchFilterDto } from './dto/search-filter.dto';
import { SearchOrchestratorService } from './orchestrators/search-orchestrator.service';
import { SearchVariantsCache } from './cache/search-variants.cache';
import {
  Doctor,
  DoctorDocument,
} from '@app/common/database/schemas/doctor.schema';
import { ApprovalStatus } from '@app/common/database/schemas/common.enums';
import { SimilarDoctorsDto } from './dto/similar-doctors.dto';

@Injectable()
export class SearchService {
  constructor(
    private readonly orchestrator: SearchOrchestratorService,
    private readonly cache: SearchVariantsCache,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
  ) {}

  async searchAll(dto: SearchFilterDto) {
    return this.orchestrator.searchAll(dto);
  }

  async getSimilarDoctors(dto: SimilarDoctorsDto) {
    const { doctorId, page = 1, limit = 10 } = dto;

    const doctor = await this.doctorModel
      .findById(doctorId)
      .select('privateSpecialization')
      .lean()
      .exec();

    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    const skip = (page - 1) * limit;
    const filter = {
      _id: { $ne: new Types.ObjectId(doctorId) },
      privateSpecialization: doctor.privateSpecialization,
      status: ApprovalStatus.APPROVED,
    };

    const [doctors, total] = await Promise.all([
      this.doctorModel
        .find(filter)
        .select(
          'firstName middleName lastName image city subcity ' +
            'publicSpecialization privateSpecialization ' +
            'inspectionPrice inspectionDuration rating',
        )
        .sort({ rating: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.doctorModel.countDocuments(filter),
    ]);

    return {
      data: doctors,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  clearCache() {
    this.cache.clear();
    console.log('✅ Search cache cleared');
  }
}
