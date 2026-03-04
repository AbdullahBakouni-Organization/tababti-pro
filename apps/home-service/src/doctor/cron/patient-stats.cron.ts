// cron/patient-stats.cron.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Doctor,
  DoctorDocument,
} from '@app/common/database/schemas/doctor.schema';
import { DoctorService } from '../doctor.service';
import { ApprovalStatus } from '@app/common/database/schemas/common.enums';

@Injectable()
export class PatientStatsCron {
  private readonly logger = new Logger(PatientStatsCron.name);

  constructor(
    @InjectModel(Doctor.name)
    private doctorModel: Model<DoctorDocument>,
    private readonly doctorService: DoctorService,
  ) {}

  /**
   * Runs every day at midnight (00:00)
   * Pre-warms the gender stats cache for ALL active doctors
   * so the first request of the day is never a cache miss
   */
  // @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async refreshAllDoctorPatientStats(): Promise<void> {
    this.logger.log(
      '🕛 [PatientStatsCron] Starting daily gender stats refresh',
    );

    const startTime = Date.now();

    // Get all active doctor IDs
    const doctors = await this.doctorModel
      .find({ status: ApprovalStatus.APPROVED })
      .select('_id')
      .lean()
      .exec();

    this.logger.log(
      `[PatientStatsCron] Found ${doctors.length} active doctors to process`,
    );

    let success = 0;
    let failed = 0;

    // Process in batches of 10 to avoid overloading DB
    const BATCH_SIZE = 10;

    for (let i = 0; i < doctors.length; i += BATCH_SIZE) {
      const batch = doctors.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map((doc) =>
          this.doctorService.computeAndCacheStats(doc._id.toString()),
        ),
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          success++;
        } else {
          failed++;
          this.logger.error(
            `[PatientStatsCron] Failed for doctor ${batch[index]._id.toString()}: ${result.reason?.message}`,
          );
        }
      });

      this.logger.debug(
        `[PatientStatsCron] Progress: ${Math.min(i + BATCH_SIZE, doctors.length)}/${doctors.length}`,
      );
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    this.logger.log(
      `[PatientStatsCron] ✅ Done in ${duration}s — success: ${success}, failed: ${failed}`,
    );
  }
}
