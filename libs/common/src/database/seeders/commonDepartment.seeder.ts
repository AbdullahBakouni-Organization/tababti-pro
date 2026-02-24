import 'dotenv/config';
import * as common from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { faker } from '@faker-js/faker';

import { CommonDepartment } from '../schemas/common_departments.schema';
import { Hospital } from '../schemas/hospital.schema';
import { Center } from '../schemas/center.schema';
import { PrivateSpecialization } from '../schemas/privatespecializations.schema';

import {
  DepartmentType,
  Machines,
  CommonSurgery,
} from '../schemas/common.enums';

@common.Injectable()
export class CommonDepartmentSeeder {
  constructor(private readonly app: common.INestApplicationContext) {}
  async seed() {
    const departmentModel = this.app.get<Model<CommonDepartment>>(
      getModelToken(CommonDepartment.name),
    );

    const hospitalModel = this.app.get<Model<Hospital>>(
      getModelToken(Hospital.name),
    );

    const centerModel = this.app.get<Model<Center>>(getModelToken(Center.name));

    const specializationModel = this.app.get<Model<PrivateSpecialization>>(
      getModelToken(PrivateSpecialization.name),
    );

    console.log('🧹 Clearing Departments...');
    await departmentModel.deleteMany({});

    const hospitals = await hospitalModel.find();
    const centers = await centerModel.find();
    const specializations = await specializationModel.find();

    if (!hospitals.length && !centers.length)
      throw new Error('No hospitals or centers found');

    if (!specializations.length) throw new Error('No specializations found');

    // =====================================================
    // CONFIG
    // =====================================================

    const departmentConfig = {
      [DepartmentType.Cardiac_Surgery]: {
        machines: [
          Machines.HeartMonitor,
          Machines.ECGMachine,
          Machines.Ventilator,
        ],
        operations: [
          CommonSurgery.Heart_OpenSurgery,
          CommonSurgery.Heart_CatheterSurgery,
        ],
        beds: [10, 40],
      },

      [DepartmentType.Dentistry]: {
        machines: [Machines.DentalChair, Machines.XRayMachine],
        operations: [
          CommonSurgery.Dental_Implant,
          CommonSurgery.Dental_ToothExtraction,
        ],
        beds: [0, 5],
      },

      [DepartmentType.Radiology]: {
        machines: [
          Machines.MRIMachine,
          Machines.CTScanner,
          Machines.XRayMachine,
        ],
        operations: [],
        beds: [0, 0],
      },

      [DepartmentType.ICU]: {
        machines: [Machines.Ventilator, Machines.ICUMonitor],
        operations: [],
        beds: [5, 20],
      },
    };

    // =====================================================
    // GENERATORS
    // =====================================================

    const generateDoctors = (count: number) =>
      Array.from({ length: count }).map(() => ({
        name: faker.person.fullName(),
        id: faker.string.uuid(),
        specialization:
          specializations[
            faker.number.int({
              min: 0,
              max: specializations.length - 1,
            })
          ]._id,
      }));

    const generateStaff = (count: number) =>
      Array.from({ length: count }).map(() => ({
        name: faker.person.fullName(),
        id: faker.string.uuid(),
      }));

    const generateMachines = (machines: Machines[]) =>
      machines.map((machine) => ({
        name: machine,
        id: faker.string.uuid(),
        location: `Room ${faker.number.int({ min: 1, max: 20 })}`,
      }));

    const generateOperations = (operations: CommonSurgery[]) =>
      operations.map((operation) => ({
        name: operation,
        id: faker.string.uuid(),
      }));

    // =====================================================
    // CREATE
    // =====================================================

    const types = Object.keys(departmentConfig);

    for (let i = 0; i < 50; i++) {
      const type = faker.helpers.arrayElement(types);

      const config = departmentConfig[type];

      const isHospital = Math.random() > 0.5;

      const hospital =
        hospitals[faker.number.int({ min: 0, max: hospitals.length - 1 })];

      const center =
        centers[faker.number.int({ min: 0, max: centers.length - 1 })];

      await departmentModel.create({
        hospitalId: isHospital ? hospital._id : undefined,

        centerId: !isHospital ? center._id : undefined,

        type,

        doctors: generateDoctors(5),

        nurses: generateStaff(4),

        machines_type: faker.helpers.arrayElement(config.machines),

        machines: generateMachines(config.machines),

        operations: generateOperations(config.operations),

        numberOfBeds: faker.number.int({
          min: config.beds[0],
          max: config.beds[1],
        }),
      });

      console.log(`✅ Created Department: ${type}`);
    }

    console.log('🎉 CommonDepartments Seeded Successfully');
  }
}
