import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CommonDepartment } from '@app/common/database/schemas/common_departments.schema';

export interface HospitalCapabilities {
  departments: string[];
  operations: { name: string; id: string }[];
  machines: { name: string; id: string; location: string }[];
}

@Injectable()
export class HospitalIncludeEnhancer {
  constructor(
    @InjectModel(CommonDepartment.name)
    private readonly departmentModel: Model<CommonDepartment>,
  ) {}

  async withDepartments(
    hospitals: any[],
  ): Promise<(any & HospitalCapabilities)[]> {
    if (!hospitals.length) return [];

    const hospitalIds = hospitals.map((h) => new Types.ObjectId(h._id));

    const departments = await this.departmentModel
      .find({ hospitalId: { $in: hospitalIds } })
      .lean();

    const grouped: Record<string, HospitalCapabilities> = {};

    for (const dep of departments) {
      const key = dep.hospitalId.toString();
      if (!grouped[key]) {
        grouped[key] = { departments: [], operations: [], machines: [] };
      }

      if (dep.type && !grouped[key].departments.includes(dep.type)) {
        grouped[key].departments.push(dep.type);
      }

      if (dep.operations?.length) {
        grouped[key].operations.push(
          ...dep.operations.map((op) => ({ name: op.name, id: op.id })),
        );
      }

      if (dep.machines?.length) {
        grouped[key].machines.push(
          ...dep.machines.map((m) => ({
            name: m.name,
            id: m.id,
            location: m.location,
          })),
        );
      }
    }

    return hospitals.map((hospital) => ({
      ...hospital,
      ...(grouped[hospital._id.toString()] ?? {
        departments: [],
        operations: [],
        machines: [],
      }),
    }));
  }
}
