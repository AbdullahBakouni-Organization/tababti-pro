/**
 * Hospital Seeder — with CommonDepartments
 *
 * Seeds realistic Syrian hospital documents plus their associated
 * CommonDepartment sub-documents.
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register \
 *     libs/common/src/database/seeds/hospital.seeder.ts
 *
 * Idempotent: skips hospitals and departments that already exist.
 * Never modifies existing documents.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { faker } from '@faker-js/faker';

import { DatabaseModule } from '../database.module';
import { Hospital } from '../schemas/hospital.schema';
import { Cities } from '../schemas/cities.schema';
import { CommonDepartment } from '../schemas/common_departments.schema';
import { PrivateSpecialization } from '../schemas/privatespecializations.schema';
import {
  HospitalCategory,
  HospitalSpecialization,
  HospitalStatus,
  ApprovalStatus,
  City,
  DepartmentType,
  Machines,
  CommonSurgery,
} from '../schemas/common.enums';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhoneEntry {
  whatsup: string[];
  clinic: string[];
  normal: string[];
  emergency: string[];
}

interface DoctorEntry {
  name: string;
  id: string;
  specialization?: Types.ObjectId;
}

interface NurseEntry {
  name: string;
  id: string;
}

interface MachineEntry {
  name: Machines;
  id: string;
  location: string;
}

interface OperationEntry {
  name: CommonSurgery;
  id: string;
}

interface DepartmentBlueprint {
  type: DepartmentType;
  machines_type: Machines;
  machines: MachineEntry[];
  operations: OperationEntry[];
  nurses: NurseEntry[];
  numberOfBeds: number;
}

interface HospitalBlueprint {
  name: string;
  address: string;
  cityName: City;
  category: HospitalCategory;
  hospitalstatus: HospitalStatus;
  hospitalSpecialization: HospitalSpecialization;
  phones: PhoneEntry[];
  latitude: number;
  longitude: number;
  rating: number;
  insuranceCompanies: { name: string; id: string; location: string }[];
  departments: DepartmentBlueprint[];
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const HOSPITALS: HospitalBlueprint[] = [
  {
    name: 'مشفى الشفاء الجامعي',
    address: 'دمشق - المزة - شارع المدينة الجامعية',
    cityName: City.Damascus,
    category: HospitalCategory.GENERAL,
    hospitalstatus: HospitalStatus.WORKS,
    hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
    phones: [
      {
        normal: ['011-2345678', '011-3456789'],
        clinic: ['011-2345600'],
        whatsup: ['0991234567'],
        emergency: ['011-2345911'],
      },
    ],
    latitude: 33.5138,
    longitude: 36.2765,
    rating: 4,
    insuranceCompanies: [
      { name: 'التأمين السوري', id: 'INS-001', location: 'دمشق - المزة' },
      {
        name: 'شركة الاتحاد للتأمين',
        id: 'INS-002',
        location: 'دمشق - الحمرا',
      },
    ],
    departments: [
      {
        type: DepartmentType.ICU,
        machines_type: Machines.Ventilator,
        machines: [
          {
            name: Machines.Ventilator,
            id: 'SHFA-VNT-001',
            location: 'الطابق الثاني - غرفة العناية 201',
          },
          {
            name: Machines.ICUMonitor,
            id: 'SHFA-ICU-001',
            location: 'الطابق الثاني - غرفة العناية 202',
          },
          {
            name: Machines.PulseOximeter,
            id: 'SHFA-OXI-001',
            location: 'الطابق الثاني - غرفة العناية 203',
          },
        ],
        operations: [],
        nurses: [
          { name: 'نور الدين سالم الأحمد', id: 'SHFA-NRS-001' },
          { name: 'هناء محمد الحلبي', id: 'SHFA-NRS-002' },
          { name: 'كريم يوسف الدمشقي', id: 'SHFA-NRS-003' },
        ],
        numberOfBeds: 18,
      },
      {
        type: DepartmentType.Radiology,
        machines_type: Machines.XRayMachine,
        machines: [
          {
            name: Machines.XRayMachine,
            id: 'SHFA-XRY-001',
            location: 'الطابق الأول - قسم الأشعة السينية',
          },
          {
            name: Machines.CTScanner,
            id: 'SHFA-CTS-001',
            location: 'الطابق الأول - قسم الأشعة المقطعية',
          },
          {
            name: Machines.MRIMachine,
            id: 'SHFA-MRI-001',
            location: 'الطابق الأول - قسم الرنين المغناطيسي',
          },
        ],
        operations: [],
        nurses: [
          { name: 'أحمد الحسن العلي', id: 'SHFA-NRS-004' },
          { name: 'ليلى سعيد الخطيب', id: 'SHFA-NRS-005' },
        ],
        numberOfBeds: 0,
      },
      {
        type: DepartmentType.General_Surgery,
        machines_type: Machines.AnesthesiaMachine,
        machines: [
          {
            name: Machines.AnesthesiaMachine,
            id: 'SHFA-ANS-001',
            location: 'الطابق الثالث - غرفة العمليات 1',
          },
          {
            name: Machines.LaserSurgeryDevice,
            id: 'SHFA-LSR-001',
            location: 'الطابق الثالث - غرفة العمليات 2',
          },
        ],
        operations: [
          { name: CommonSurgery.Gastrointestinal_Surgery, id: 'SHFA-OP-001' },
          { name: CommonSurgery.Stomach_Surgery, id: 'SHFA-OP-002' },
        ],
        nurses: [
          { name: 'سمر علي السويدي', id: 'SHFA-NRS-006' },
          { name: 'طارق نجم الحمصي', id: 'SHFA-NRS-007' },
        ],
        numberOfBeds: 22,
      },
    ],
  },

  {
    name: 'مشفى ابن سينا التخصصي للقلب',
    address: 'حلب - الجميلية - شارع النيل قرب دوار السبيل',
    cityName: City.Aleppo,
    category: HospitalCategory.PRIVATE,
    hospitalstatus: HospitalStatus.WORKS,
    hospitalSpecialization: HospitalSpecialization.CardiacSurgery,
    phones: [
      {
        normal: ['021-2345678', '021-2345679'],
        clinic: ['021-2345690'],
        whatsup: ['0992345678'],
        emergency: ['021-2345999'],
      },
    ],
    latitude: 36.2021,
    longitude: 37.1343,
    rating: 5,
    insuranceCompanies: [
      {
        name: 'التأمين التعاوني السوري',
        id: 'INS-010',
        location: 'حلب - الجميلية',
      },
    ],
    departments: [
      {
        type: DepartmentType.Cardiac_Surgery,
        machines_type: Machines.HeartMonitor,
        machines: [
          {
            name: Machines.HeartMonitor,
            id: 'IBNS-HRT-001',
            location: 'الطابق الثالث - قسم القلب - غرفة 301',
          },
          {
            name: Machines.ECGMachine,
            id: 'IBNS-ECG-001',
            location: 'الطابق الثالث - قسم القلب - غرفة 302',
          },
          {
            name: Machines.Ventilator,
            id: 'IBNS-VNT-001',
            location: 'الطابق الثالث - قسم القلب - غرفة 303',
          },
        ],
        operations: [
          { name: CommonSurgery.Heart_OpenSurgery, id: 'IBNS-OP-001' },
          { name: CommonSurgery.Heart_CatheterSurgery, id: 'IBNS-OP-002' },
          { name: CommonSurgery.Heart_ValveReplacement, id: 'IBNS-OP-003' },
        ],
        nurses: [
          { name: 'سلمى يوسف الحلبي', id: 'IBNS-NRS-001' },
          { name: 'خالد نصر الدين قطيفة', id: 'IBNS-NRS-002' },
          { name: 'منى حسام الشهابي', id: 'IBNS-NRS-003' },
        ],
        numberOfBeds: 30,
      },
      {
        type: DepartmentType.ICU,
        machines_type: Machines.ICUMonitor,
        machines: [
          {
            name: Machines.ICUMonitor,
            id: 'IBNS-ICU-001',
            location: 'الطابق الرابع - العناية المركزة القلبية',
          },
          {
            name: Machines.Ventilator,
            id: 'IBNS-VNT-002',
            location: 'الطابق الرابع - العناية المركزة القلبية',
          },
          {
            name: Machines.BloodPressureMonitor,
            id: 'IBNS-BPM-001',
            location: 'الطابق الرابع - العناية المركزة القلبية',
          },
        ],
        operations: [],
        nurses: [
          { name: 'ريم الأحمد الشامي', id: 'IBNS-NRS-004' },
          { name: 'عمر الجندي الحلبي', id: 'IBNS-NRS-005' },
        ],
        numberOfBeds: 14,
      },
    ],
  },

  {
    name: 'مشفى حمص الوطني العام',
    address: 'حمص - الخالدية - شارع الحضارة الرئيسي',
    cityName: City.Homs,
    category: HospitalCategory.GENERAL,
    hospitalstatus: HospitalStatus.WORKS,
    hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
    phones: [
      {
        normal: ['031-2345678', '031-2345679', '031-2345680'],
        clinic: ['031-2345690'],
        whatsup: ['0993456789'],
        emergency: ['031-2345911'],
      },
    ],
    latitude: 34.7324,
    longitude: 36.7137,
    rating: 3,
    insuranceCompanies: [
      { name: 'التأمين الوطني', id: 'INS-020', location: 'حمص - الخالدية' },
      {
        name: 'مجموعة أليانز سوريا',
        id: 'INS-021',
        location: 'حمص - شارع الحضارة',
      },
    ],
    departments: [
      {
        type: DepartmentType.Emergency_Department,
        machines_type: Machines.BloodPressureMonitor,
        machines: [
          {
            name: Machines.BloodPressureMonitor,
            id: 'HOMS-BPM-001',
            location: 'الطابق الأرضي - قسم الطوارئ',
          },
          {
            name: Machines.Ventilator,
            id: 'HOMS-VNT-001',
            location: 'الطابق الأرضي - قسم الطوارئ',
          },
          {
            name: Machines.ECGMachine,
            id: 'HOMS-ECG-001',
            location: 'الطابق الأرضي - قسم الطوارئ',
          },
        ],
        operations: [],
        nurses: [
          { name: 'وليد الزعيم الحمصي', id: 'HOMS-NRS-001' },
          { name: 'دينا ناجي العلوي', id: 'HOMS-NRS-002' },
          { name: 'فارس سلطان القدسي', id: 'HOMS-NRS-003' },
          { name: 'رنا عدنان الراشدي', id: 'HOMS-NRS-004' },
        ],
        numberOfBeds: 10,
      },
      {
        type: DepartmentType.Orthopedic_Surgery,
        machines_type: Machines.XRayMachine,
        machines: [
          {
            name: Machines.XRayMachine,
            id: 'HOMS-XRY-001',
            location: 'الطابق الثاني - قسم العظام',
          },
          {
            name: Machines.BoneDensitometer,
            id: 'HOMS-BND-001',
            location: 'الطابق الثاني - قسم العظام',
          },
        ],
        operations: [
          { name: CommonSurgery.Bones_Surgery, id: 'HOMS-OP-001' },
          { name: CommonSurgery.Knee_Joint_Surgery, id: 'HOMS-OP-002' },
          { name: CommonSurgery.Fracture_Surgery, id: 'HOMS-OP-003' },
        ],
        nurses: [
          { name: 'سهيل ياسر الحموي', id: 'HOMS-NRS-005' },
          { name: 'نادين طارق الأحمد', id: 'HOMS-NRS-006' },
        ],
        numberOfBeds: 16,
      },
    ],
  },

  {
    name: 'مشفى الرازي التخصصي للأعصاب',
    address: 'حماة - حي القصور - شارع كمال الأتاتورك',
    cityName: City.Hama,
    category: HospitalCategory.PRIVATE,
    hospitalstatus: HospitalStatus.WORKS,
    hospitalSpecialization: HospitalSpecialization.Neurosurgery,
    phones: [
      {
        normal: ['033-2345678', '033-2345679'],
        clinic: ['033-2345680'],
        whatsup: ['0994567890'],
        emergency: ['033-2345911'],
      },
    ],
    latitude: 35.1318,
    longitude: 36.7489,
    rating: 4,
    insuranceCompanies: [
      { name: 'شركة الحياة للتأمين', id: 'INS-030', location: 'حماة - القصور' },
    ],
    departments: [
      {
        type: DepartmentType.Neurosurgery,
        machines_type: Machines.MRIMachine,
        machines: [
          {
            name: Machines.MRIMachine,
            id: 'RAZI-MRI-001',
            location: 'الطابق الثاني - قسم الأعصاب',
          },
          {
            name: Machines.CTScanner,
            id: 'RAZI-CTS-001',
            location: 'الطابق الثاني - قسم الأعصاب',
          },
          {
            name: Machines.EEGMachine,
            id: 'RAZI-EEG-001',
            location: 'الطابق الثاني - قسم الأعصاب',
          },
          {
            name: Machines.NeurosurgeryEquipment,
            id: 'RAZI-NSQ-001',
            location: 'الطابق الثالث - غرفة العمليات',
          },
        ],
        operations: [
          { name: CommonSurgery.Brain_Surgery, id: 'RAZI-OP-001' },
          { name: CommonSurgery.Brain_TumorSurgery, id: 'RAZI-OP-002' },
          { name: CommonSurgery.Spine_Surgery, id: 'RAZI-OP-003' },
        ],
        nurses: [
          { name: 'مازن الوادي الحموي', id: 'RAZI-NRS-001' },
          { name: 'إيمان الديب السورية', id: 'RAZI-NRS-002' },
          { name: 'حسان نور الدين المصري', id: 'RAZI-NRS-003' },
        ],
        numberOfBeds: 20,
      },
      {
        type: DepartmentType.ICU,
        machines_type: Machines.ICUMonitor,
        machines: [
          {
            name: Machines.ICUMonitor,
            id: 'RAZI-ICU-001',
            location: 'الطابق الأول - العناية المركزة العصبية',
          },
          {
            name: Machines.Ventilator,
            id: 'RAZI-VNT-001',
            location: 'الطابق الأول - العناية المركزة العصبية',
          },
        ],
        operations: [],
        nurses: [
          { name: 'نجوى سعيد البارودي', id: 'RAZI-NRS-004' },
          { name: 'غسان طه الطرابلسي', id: 'RAZI-NRS-005' },
        ],
        numberOfBeds: 10,
      },
    ],
  },

  {
    name: 'مشفى اللاذقية الجامعي',
    address: 'اللاذقية - شارع بغداد - قرب المشفى الوطني',
    cityName: City.Latakia,
    category: HospitalCategory.GENERAL,
    hospitalstatus: HospitalStatus.WORKS,
    hospitalSpecialization: HospitalSpecialization.ObstetricsGynecology,
    phones: [
      {
        normal: ['041-2345678', '041-2345679'],
        clinic: ['041-2345680', '041-2345681'],
        whatsup: ['0995678901'],
        emergency: ['041-2345911'],
      },
    ],
    latitude: 35.5298,
    longitude: 35.7916,
    rating: 4,
    insuranceCompanies: [
      {
        name: 'التأمين الدولي السوري',
        id: 'INS-040',
        location: 'اللاذقية - شارع بغداد',
      },
      {
        name: 'شركة العربية للتأمين',
        id: 'INS-041',
        location: 'اللاذقية - الشاطئ',
      },
    ],
    departments: [
      {
        type: DepartmentType.Gynecology_Obstetrics,
        machines_type: Machines.UltrasoundMachine,
        machines: [
          {
            name: Machines.UltrasoundMachine,
            id: 'LADQ-ULT-001',
            location: 'الطابق الثاني - قسم النساء والتوليد',
          },
          {
            name: Machines.UltrasoundMachine,
            id: 'LADQ-ULT-002',
            location: 'الطابق الثاني - قسم النساء والتوليد - غرفة 2',
          },
        ],
        operations: [
          { name: CommonSurgery.Cesarean_Section, id: 'LADQ-OP-001' },
          { name: CommonSurgery.Women_Obstetrics_Surgery, id: 'LADQ-OP-002' },
        ],
        nurses: [
          { name: 'آية الله الزين اللاذقاني', id: 'LADQ-NRS-001' },
          { name: 'هدى سمير البحر', id: 'LADQ-NRS-002' },
          { name: 'سوسن القاضي الساحلي', id: 'LADQ-NRS-003' },
          { name: 'تمارا حسين الطرطوسي', id: 'LADQ-NRS-004' },
        ],
        numberOfBeds: 25,
      },
      {
        type: DepartmentType.Pediatrics,
        machines_type: Machines.PulseOximeter,
        machines: [
          {
            name: Machines.PulseOximeter,
            id: 'LADQ-OXI-001',
            location: 'الطابق الثالث - قسم الأطفال',
          },
          {
            name: Machines.Nebulizer,
            id: 'LADQ-NEB-001',
            location: 'الطابق الثالث - قسم الأطفال',
          },
        ],
        operations: [],
        nurses: [
          { name: 'رانيا الصالح الحلبي', id: 'LADQ-NRS-005' },
          { name: 'يزن الملاح اللاذقاني', id: 'LADQ-NRS-006' },
        ],
        numberOfBeds: 20,
      },
    ],
  },

  {
    name: 'مشفى الكندي التخصصي',
    address: 'ريف دمشق - دوما - الشارع الرئيسي مقابل البلدية',
    cityName: City.RifDimashq,
    category: HospitalCategory.PRIVATE,
    hospitalstatus: HospitalStatus.WORKS,
    hospitalSpecialization: HospitalSpecialization.GeneralSurgery,
    phones: [
      {
        normal: ['011-5710570', '011-5710571'],
        clinic: ['011-5710572'],
        whatsup: ['0996789012'],
        emergency: ['011-5710911'],
      },
    ],
    latitude: 33.5718,
    longitude: 36.3972,
    rating: 4,
    insuranceCompanies: [
      {
        name: 'شركة الثقة للتأمين',
        id: 'INS-050',
        location: 'ريف دمشق - دوما',
      },
    ],
    departments: [
      {
        type: DepartmentType.General_Surgery,
        machines_type: Machines.AnesthesiaMachine,
        machines: [
          {
            name: Machines.AnesthesiaMachine,
            id: 'KEND-ANS-001',
            location: 'الطابق الثاني - غرفة العمليات الرئيسية',
          },
          {
            name: Machines.EndoscopyDevice,
            id: 'KEND-END-001',
            location: 'الطابق الثاني - قسم التنظير',
          },
          {
            name: Machines.Gastroscope,
            id: 'KEND-GAS-001',
            location: 'الطابق الثاني - قسم منظار المعدة',
          },
        ],
        operations: [
          { name: CommonSurgery.Gastrointestinal_Surgery, id: 'KEND-OP-001' },
          { name: CommonSurgery.Colon_Surgery, id: 'KEND-OP-002' },
          { name: CommonSurgery.Intestine_Surgery, id: 'KEND-OP-003' },
        ],
        nurses: [
          { name: 'باسل الريحاوي الدمشقي', id: 'KEND-NRS-001' },
          { name: 'روعة العمري الحوراني', id: 'KEND-NRS-002' },
        ],
        numberOfBeds: 18,
      },
      {
        type: DepartmentType.Blood_Lab,
        machines_type: Machines.BloodAnalyzer,
        machines: [
          {
            name: Machines.BloodAnalyzer,
            id: 'KEND-BLD-001',
            location: 'الطابق الأول - مختبر الدم',
          },
          {
            name: Machines.BiochemistryAnalyzer,
            id: 'KEND-BCH-001',
            location: 'الطابق الأول - مختبر الكيمياء',
          },
        ],
        operations: [],
        nurses: [{ name: 'نبيل الغانم الريفي', id: 'KEND-NRS-003' }],
        numberOfBeds: 0,
      },
    ],
  },

  {
    name: 'مشفى دار الشفاء التخصصي للعيون',
    address: 'دمشق - أبو رمانة - شارع الأرجنتين',
    cityName: City.Damascus,
    category: HospitalCategory.PRIVATE,
    hospitalstatus: HospitalStatus.WORKS,
    hospitalSpecialization: HospitalSpecialization.Ophthalmology,
    phones: [
      {
        normal: ['011-3326030', '011-3326031'],
        clinic: ['011-3326032'],
        whatsup: ['0997890123'],
        emergency: [],
      },
    ],
    latitude: 33.5149,
    longitude: 36.2893,
    rating: 5,
    insuranceCompanies: [
      {
        name: 'التأمين الصحي الوطني',
        id: 'INS-060',
        location: 'دمشق - أبو رمانة',
      },
    ],
    departments: [
      {
        type: DepartmentType.Eye_Surgery,
        machines_type: Machines.LaserSurgeryDevice,
        machines: [
          {
            name: Machines.LaserSurgeryDevice,
            id: 'EYES-LSR-001',
            location: 'الطابق الثاني - غرفة جراحة الليزر',
          },
          {
            name: Machines.ClinicalDiagnosticEquipment,
            id: 'EYES-CDX-001',
            location: 'الطابق الأول - قسم الفحص',
          },
        ],
        operations: [
          { name: CommonSurgery.Eye_Laser, id: 'EYES-OP-001' },
          { name: CommonSurgery.Eye_Glaucoma, id: 'EYES-OP-002' },
          { name: CommonSurgery.Eye_LensRemoval, id: 'EYES-OP-003' },
        ],
        nurses: [
          { name: 'عروبة الحمد الدمشقية', id: 'EYES-NRS-001' },
          { name: 'أنس القاسمي الشامي', id: 'EYES-NRS-002' },
        ],
        numberOfBeds: 8,
      },
      {
        type: DepartmentType.Ophthalmology,
        machines_type: Machines.ClinicalDiagnosticEquipment,
        machines: [
          {
            name: Machines.ClinicalDiagnosticEquipment,
            id: 'EYES-CDX-002',
            location: 'الطابق الأول - عيادة الفحص 1',
          },
          {
            name: Machines.ClinicalDiagnosticEquipment,
            id: 'EYES-CDX-003',
            location: 'الطابق الأول - عيادة الفحص 2',
          },
        ],
        operations: [],
        nurses: [{ name: 'لمى الزبيدي العلوي', id: 'EYES-NRS-003' }],
        numberOfBeds: 4,
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDoctors(count: number, specIds: Types.ObjectId[]): DoctorEntry[] {
  return Array.from({ length: count }).map((_, i) => {
    const entry: DoctorEntry = {
      name:
        faker.helpers.arrayElement([
          'د. أحمد عبد الرحمن',
          'د. محمد خالد العلي',
          'د. سامر الحسين',
          'د. عمر نور الدين',
          'د. يوسف الحسن',
          'د. باسل المصطفى',
          'د. طارق السعيد',
          'د. زياد الخوري',
          'د. رامي البيطار',
          'د. علي الصالح',
        ]) + ` (${i + 1})`,
      id: faker.string.uuid(),
    };
    if (specIds.length > 0) {
      entry.specialization =
        specIds[faker.number.int({ min: 0, max: specIds.length - 1 })];
    }
    return entry;
  });
}

// ─── Main seeder ──────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  console.log('\n🏥 [HospitalSeeder] Starting hospital seed...\n');

  const app = await NestFactory.createApplicationContext(DatabaseModule);

  try {
    const hospitalModel = app.get<Model<Hospital>>(getModelToken('Hospital'));
    const cityModel = app.get<Model<Cities>>(getModelToken('Cities'));
    const departmentModel = app.get<Model<CommonDepartment>>(
      getModelToken('CommonDepartment'),
    );
    const specializationModel = app.get<Model<PrivateSpecialization>>(
      getModelToken('PrivateSpecialization'),
    );

    // ── Pre-load PrivateSpecialization IDs for doctor references ─────────────
    const specs = await specializationModel.find().select('_id').lean();
    const specIds: Types.ObjectId[] = specs.map((s) => s._id as Types.ObjectId);

    if (specIds.length === 0) {
      console.warn(
        '⚠️  [HospitalSeeder] No PrivateSpecialization docs found — ' +
          'doctors will be seeded without a specialization reference.',
      );
    }

    let insertedHospitals = 0;
    let skippedHospitals = 0;
    let insertedDepartments = 0;
    let skippedDepartments = 0;

    for (const blueprint of HOSPITALS) {
      // ── Resolve cityId ────────────────────────────────────────────────────
      const city = await cityModel.findOne({ name: blueprint.cityName }).lean();

      if (!city) {
        console.warn(
          `⚠️  [HospitalSeeder] City "${blueprint.cityName}" not found — ` +
            `skipping hospital "${blueprint.name}". Seed cities first.`,
        );
        skippedHospitals++;
        continue;
      }

      // ── Idempotency: skip if hospital already exists by name ──────────────
      const existing = await hospitalModel
        .findOne({ name: blueprint.name })
        .lean();

      let hospitalId: Types.ObjectId;

      if (existing) {
        console.log(
          `⏭️  [HospitalSeeder] Already exists: "${blueprint.name}" — skipping insert.`,
        );
        hospitalId = existing._id as Types.ObjectId;
        skippedHospitals++;
      } else {
        const inserted = await hospitalModel.create({
          authAccountId: new Types.ObjectId(),
          name: blueprint.name,
          address: blueprint.address,
          cityId: city._id,
          category: blueprint.category,
          hospitalstatus: blueprint.hospitalstatus,
          hospitalSpecialization: blueprint.hospitalSpecialization,
          phones: blueprint.phones,
          latitude: blueprint.latitude,
          longitude: blueprint.longitude,
          rating: blueprint.rating,
          status: ApprovalStatus.APPROVED,
          insuranceCompanies: blueprint.insuranceCompanies,
          gallery: [],
          searchCount: 0,
          profileViews: 0,
          isSubscribed: false,
        });

        hospitalId = inserted._id as Types.ObjectId;
        console.log(
          `✅ [HospitalSeeder] Inserted: "${blueprint.name}" (${hospitalId})`,
        );
        insertedHospitals++;
      }

      // ── Seed CommonDepartments for this hospital ──────────────────────────
      for (const dept of blueprint.departments) {
        const deptExists = await departmentModel
          .findOne({ hospitalId, type: dept.type })
          .lean();

        if (deptExists) {
          console.log(
            `  ⏭️  [HospitalSeeder] Department "${dept.type}" already exists ` +
              `for "${blueprint.name}" — skipping.`,
          );
          skippedDepartments++;
          continue;
        }

        await departmentModel.create({
          hospitalId,
          type: dept.type,
          machines_type: dept.machines_type,
          machines: dept.machines,
          operations: dept.operations,
          nurses: dept.nurses,
          numberOfBeds: dept.numberOfBeds,
          doctors: buildDoctors(3, specIds),
        });

        console.log(
          `  ➕ [HospitalSeeder] Created department "${dept.type}" ` +
            `for "${blueprint.name}"`,
        );
        insertedDepartments++;
      }
    }

    console.log('\n─────────────────────────────────────────────────────');
    console.log(
      `🏥 Hospitals  — inserted: ${insertedHospitals}, skipped: ${skippedHospitals}`,
    );
    console.log(
      `🏗️  Departments — inserted: ${insertedDepartments}, skipped: ${skippedDepartments}`,
    );
    console.log('✅ [HospitalSeeder] Done.\n');
  } finally {
    await app.close();
  }
}

seed().catch((err: Error) => {
  console.error('❌ [HospitalSeeder] Fatal error:', err.message);
  process.exit(1);
});
