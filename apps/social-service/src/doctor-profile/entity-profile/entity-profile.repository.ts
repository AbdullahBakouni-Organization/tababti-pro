// entity-profile.repository.ts (ENHANCED)
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Hospital } from '@app/common/database/schemas/hospital.schema';
import { Center } from '@app/common/database/schemas/center.schema';
import { CommonDepartment } from '@app/common/database/schemas/common_departments.schema';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { EntityType } from '../dto/get-entity-profile.dto';

// Doctor → status, Hospital → status, Center → approvalStatus
const STATUS_FIELD: Record<EntityType, string> = {
  [EntityType.DOCTOR]: 'status',
  [EntityType.HOSPITAL]: 'status',
  [EntityType.CENTER]: 'approvalStatus',
};

@Injectable()
export class EntityProfileRepository {
  constructor(
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(Hospital.name) private readonly hospitalModel: Model<Hospital>,
    @InjectModel(Center.name) private readonly centerModel: Model<Center>,
    @InjectModel(CommonDepartment.name)
    private readonly departmentModel: Model<CommonDepartment>,
  ) {}

  private assertValidId(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('common.INVALID_ID');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FIND BY ID METHODS (with lean for performance)
  // ══════════════════════════════════════════════════════════════════════════

  async findDoctorById(id: string) {
    this.assertValidId(id);
    return this.doctorModel
      .findOne({ _id: new Types.ObjectId(id), status: 'approved' })
      .select('-password -twoFactorSecret -sessions -workingHoursVersion')
      .lean();
  }

  async findHospitalById(id: string) {
    this.assertValidId(id);
    return this.hospitalModel
      .findOne({ _id: new Types.ObjectId(id), status: 'approved' })
      .select('-deviceTokens')
      .lean();
  }

  async findCenterById(id: string) {
    this.assertValidId(id);
    return this.centerModel
      .findOne({ _id: new Types.ObjectId(id), approvalStatus: 'approved' })
      .select('-deviceTokens')
      .lean();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DEPARTMENT METHODS (NEW)
  // ══════════════════════════════════════════════════════════════════════════

  async findHospitalDepartments(hospitalId: string) {
    this.assertValidId(hospitalId);
    return this.departmentModel
      .find({ hospitalId: new Types.ObjectId(hospitalId) })
      .lean();
  }

  async findCenterDepartments(centerId: string) {
    this.assertValidId(centerId);
    return this.departmentModel
      .find({ centerId: new Types.ObjectId(centerId) })
      .lean();
  }

  async findDepartmentByIdAndHospital(
    hospitalId: string,
    departmentId: string,
  ) {
    this.assertValidId(hospitalId);
    this.assertValidId(departmentId);
    return this.departmentModel
      .findOne({
        _id: new Types.ObjectId(departmentId),
        hospitalId: new Types.ObjectId(hospitalId),
      })
      .lean();
  }

  async findDepartmentByIdAndCenter(centerId: string, departmentId: string) {
    this.assertValidId(centerId);
    this.assertValidId(departmentId);
    return this.departmentModel
      .findOne({
        _id: new Types.ObjectId(departmentId),
        centerId: new Types.ObjectId(centerId),
      })
      .lean();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROFILE VIEWS (INCREMENT)
  // ══════════════════════════════════════════════════════════════════════════

  async incrementDoctorViews(id: string) {
    this.assertValidId(id);
    await this.doctorModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $inc: { profileViews: 1 } },
    );
  }

  async incrementHospitalViews(id: string) {
    this.assertValidId(id);
    await this.hospitalModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $inc: { profileViews: 1 } },
    );
  }

  async incrementCenterViews(id: string) {
    this.assertValidId(id);
    await this.centerModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $inc: { profileViews: 1 } },
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GALLERY METHODS - GET
  // ══════════════════════════════════════════════════════════════════════════

  async getGallery(id: string, type: EntityType): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.doctorModel
      .findOne({ _id: new Types.ObjectId(id) })
      .select('gallery')
      .lean();
    return doc?.gallery ?? [];
  }

  async getHospitalGallery(id: string): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.hospitalModel
      .findOne({ _id: new Types.ObjectId(id) })
      .select('gallery')
      .lean();
    return doc?.gallery ?? [];
  }

  async getCenterGallery(id: string): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.centerModel
      .findOne({ _id: new Types.ObjectId(id) })
      .select('gallery')
      .lean();
    return doc?.gallery ?? [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GALLERY METHODS - ADD
  // ══════════════════════════════════════════════════════════════════════════

  async addGallery(
    id: string,
    type: EntityType,
    images: string[],
  ): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.hospitalModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id) },
        { $addToSet: { gallery: { $each: images } } },
        { new: true },
      )
      .select('gallery')
      .lean();
    return doc?.gallery ?? [];
  }

  async addCenterGallery(id: string, images: string[]): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.centerModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id) },
        { $addToSet: { gallery: { $each: images } } },
        { new: true },
      )
      .select('gallery')
      .lean();
    return doc?.gallery ?? [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GALLERY METHODS - REMOVE
  // ══════════════════════════════════════════════════════════════════════════

  async removeGallery(
    id: string,
    type: EntityType,
    images: string[],
  ): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.hospitalModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id) },
        { $pullAll: { gallery: images } },
        { new: true },
      )
      .select('gallery')
      .lean();
    return doc?.gallery ?? [];
  }

  async removeCenterGallery(id: string, images: string[]): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.centerModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id) },
        { $pullAll: { gallery: images } },
        { new: true },
      )
      .select('gallery')
      .lean();
    return doc?.gallery ?? [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GALLERY METHODS - CLEAR ALL
  // ══════════════════════════════════════════════════════════════════════════

  async clearDoctorGallery(id: string): Promise<void> {
    this.assertValidId(id);
    await this.doctorModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { gallery: [] } },
    );
  }

  async clearHospitalGallery(id: string): Promise<void> {
    this.assertValidId(id);
    await this.hospitalModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { gallery: [] } },
    );
  }

  async clearCenterGallery(id: string): Promise<void> {
    this.assertValidId(id);
    await this.centerModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { gallery: [] } },
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DEPARTMENT STATS METHODS (NEW)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Get aggregated statistics for a hospital
   * Deduplicates doctors, machines, and operations across all departments
   */
  async getHospitalStats(hospitalId: string) {
    this.assertValidId(hospitalId);
    const departments = await this.departmentModel
      .find({ hospitalId: new Types.ObjectId(hospitalId) })
      .lean();

    return this.aggregateStats(departments);
  }

  /**
   * Get aggregated statistics for a center
   * Deduplicates doctors, machines, and operations across all departments
   */
  async getCenterStats(centerId: string) {
    this.assertValidId(centerId);
    const departments = await this.departmentModel
      .find({ centerId: new Types.ObjectId(centerId) })
      .lean();

    return this.aggregateStats(departments);
  }

  /**
   * Helper method to aggregate statistics from departments
   */
  private aggregateStats(departments: any[]) {
    const doctorsMap = new Map();
    const machinesMap = new Map();
    const operationsMap = new Map();
    let totalNurses = 0;
    let totalBeds = 0;
    let departmentCount = 0;

    departments.forEach((dept) => {
      departmentCount++;

      // Aggregate doctors (deduplicate)
      dept.doctors?.forEach((doctor) => {
        if (!doctorsMap.has(doctor.id)) {
          doctorsMap.set(doctor.id, doctor);
        }
      });

      // Aggregate machines (deduplicate)
      dept.machines?.forEach((machine) => {
        if (!machinesMap.has(machine.id)) {
          machinesMap.set(machine.id, machine);
        }
      });

      // Aggregate operations (deduplicate)
      dept.operations?.forEach((operation) => {
        if (!operationsMap.has(operation.id)) {
          operationsMap.set(operation.id, operation);
        }
      });

      // Count nurses and beds
      totalNurses += dept.nurses?.length || 0;
      totalBeds += dept.numberOfBeds || 0;
    });

    return {
      totalDoctors: doctorsMap.size,
      totalNurses,
      totalBeds,
      totalMachines: machinesMap.size,
      totalOperations: operationsMap.size,
      departmentCount,
      doctorsList: Array.from(doctorsMap.values()),
      machinesList: Array.from(machinesMap.values()),
      operationsList: Array.from(operationsMap.values()),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SEARCH & FILTER METHODS (NEW)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Find doctors in a hospital by specialization
   */
  async findHospitalDoctorsBySpecialization(
    hospitalId: string,
    specialization: string,
  ) {
    this.assertValidId(hospitalId);
    return this.departmentModel
      .find({
        hospitalId: new Types.ObjectId(hospitalId),
        'doctors.specialization': new Types.ObjectId(specialization),
      })
      .lean();
  }

  /**
   * Find machines in a hospital by type
   */
  async findHospitalMachinesByType(hospitalId: string, machineType: string) {
    this.assertValidId(hospitalId);
    return this.departmentModel
      .find({
        hospitalId: new Types.ObjectId(hospitalId),
        'machines.name': machineType,
      })
      .lean();
  }

  /**
   * Find all operations in a hospital
   */
  async findHospitalOperations(hospitalId: string) {
    this.assertValidId(hospitalId);
    const departments = await this.departmentModel
      .find({ hospitalId: new Types.ObjectId(hospitalId) })
      .select('operations')
      .lean();

    const operationsMap = new Map();
    departments.forEach((dept) => {
      dept.operations?.forEach((op) => {
        if (!operationsMap.has(op.id)) {
          operationsMap.set(op.id, op);
        }
      });
    });

    return Array.from(operationsMap.values());
  }

  /**
   * Find all doctors in a hospital
   */
  async findHospitalAllDoctors(hospitalId: string) {
    this.assertValidId(hospitalId);
    const departments = await this.departmentModel
      .find({ hospitalId: new Types.ObjectId(hospitalId) })
      .select('doctors')
      .lean();

    const doctorsMap = new Map();
    departments.forEach((dept) => {
      dept.doctors?.forEach((doc) => {
        if (!doctorsMap.has(doc.id)) {
          doctorsMap.set(doc.id, doc);
        }
      });
    });

    return Array.from(doctorsMap.values());
  }

  /**
   * Find doctors in a center by specialization
   */
  async findCenterDoctorsBySpecialization(
    centerId: string,
    specialization: string,
  ) {
    this.assertValidId(centerId);
    return this.departmentModel
      .find({
        centerId: new Types.ObjectId(centerId),
        'doctors.specialization': new Types.ObjectId(specialization),
      })
      .lean();
  }

  /**
   * Find machines in a center by type
   */
  async findCenterMachinesByType(centerId: string, machineType: string) {
    this.assertValidId(centerId);
    return this.departmentModel
      .find({
        centerId: new Types.ObjectId(centerId),
        'machines.name': machineType,
      })
      .lean();
  }

  /**
   * Find all operations in a center
   */
  async findCenterOperations(centerId: string) {
    this.assertValidId(centerId);
    const departments = await this.departmentModel
      .find({ centerId: new Types.ObjectId(centerId) })
      .select('operations')
      .lean();

    const operationsMap = new Map();
    departments.forEach((dept) => {
      dept.operations?.forEach((op) => {
        if (!operationsMap.has(op.id)) {
          operationsMap.set(op.id, op);
        }
      });
    });

    return Array.from(operationsMap.values());
  }

  /**
   * Find all doctors in a center
   */
  async findCenterAllDoctors(centerId: string) {
    this.assertValidId(centerId);
    const departments = await this.departmentModel
      .find({ centerId: new Types.ObjectId(centerId) })
      .select('doctors')
      .lean();

    const doctorsMap = new Map();
    departments.forEach((dept) => {
      dept.doctors?.forEach((doc) => {
        if (!doctorsMap.has(doc.id)) {
          doctorsMap.set(doc.id, doc);
        }
      });
    });

    return Array.from(doctorsMap.values());
  }
}
