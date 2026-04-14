/**
 * Center Seeder — with CommonDepartments
 *
 * Seeds realistic Syrian medical center documents plus their associated
 * CommonDepartment sub-documents.
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register \
 *     libs/common/src/database/seeds/center.seeder.ts
 *
 * Idempotent: skips centers and departments that already exist.
 * Never modifies existing documents.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { faker } from '@faker-js/faker';

import { DatabaseModule } from '../database.module';
import { Center } from '../schemas/center.schema';
import { Cities } from '../schemas/cities.schema';
import { CommonDepartment } from '../schemas/common_departments.schema';
import { PrivateSpecialization } from '../schemas/privatespecializations.schema';
import {
  CenterSpecialization,
  ApprovalStatus,
  City,
  Days,
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

interface WorkingHourEntry {
  day: string;
  from: string;
  to: string;
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

interface CenterBlueprint {
  name: string;
  address: string;
  cityName: City;
  centerSpecialization: CenterSpecialization;
  phones: PhoneEntry[];
  latitude: number;
  longitude: number;
  rating: number;
  workingHours: WorkingHourEntry[];
  departments: DepartmentBlueprint[];
}

// ─── Working hours helpers ─────────────────────────────────────────────────────

const WEEKDAY_HOURS: WorkingHourEntry[] = [
  { day: Days.SUNDAY, from: '08:00', to: '16:00' },
  { day: Days.MONDAY, from: '08:00', to: '16:00' },
  { day: Days.TUESDAY, from: '08:00', to: '16:00' },
  { day: Days.WEDNESDAY, from: '08:00', to: '16:00' },
  { day: Days.THURSDAY, from: '08:00', to: '14:00' },
];

const EXTENDED_HOURS: WorkingHourEntry[] = [
  { day: Days.SUNDAY, from: '09:00', to: '20:00' },
  { day: Days.MONDAY, from: '09:00', to: '20:00' },
  { day: Days.TUESDAY, from: '09:00', to: '20:00' },
  { day: Days.WEDNESDAY, from: '09:00', to: '20:00' },
  { day: Days.THURSDAY, from: '09:00', to: '18:00' },
  { day: Days.SATURDAY, from: '10:00', to: '15:00' },
];

// ─── Seed data ────────────────────────────────────────────────────────────────

const CENTERS: CenterBlueprint[] = [
  {
    name: 'مركز الأمل لطب الأسنان',
    address: 'دمشق - الشعلان - شارع المأمون رقم 12',
    cityName: City.Damascus,
    centerSpecialization: CenterSpecialization.Dentistry,
    phones: [
      {
        normal: ['011-3334455', '011-3334456'],
        clinic: ['011-3334457'],
        whatsup: ['0991112233'],
        emergency: [],
      },
    ],
    latitude: 33.5198,
    longitude: 36.2963,
    rating: 5,
    workingHours: EXTENDED_HOURS,
    departments: [
      {
        type: DepartmentType.Dentistry,
        machines_type: Machines.DentalChair,
        machines: [
          {
            name: Machines.DentalChair,
            id: 'AMAL-DC-001',
            location: 'الطابق الأول - عيادة الأسنان 1',
          },
          {
            name: Machines.DentalChair,
            id: 'AMAL-DC-002',
            location: 'الطابق الأول - عيادة الأسنان 2',
          },
          {
            name: Machines.XRayMachine,
            id: 'AMAL-XRY-001',
            location: 'الطابق الأول - قسم الأشعة السنية',
          },
          {
            name: Machines.OrthodonticEquipment,
            id: 'AMAL-ORT-001',
            location: 'الطابق الثاني - عيادة التقويم',
          },
        ],
        operations: [
          { name: CommonSurgery.Dental_Implant, id: 'AMAL-OP-001' },
          { name: CommonSurgery.Dental_ToothExtraction, id: 'AMAL-OP-002' },
          { name: CommonSurgery.Dental_Braces, id: 'AMAL-OP-003' },
          { name: CommonSurgery.Dental_Fillings, id: 'AMAL-OP-004' },
        ],
        nurses: [
          { name: 'سارة الخطيب الدمشقية', id: 'AMAL-NRS-001' },
          { name: 'حمزة الرشيد العربي', id: 'AMAL-NRS-002' },
        ],
        numberOfBeds: 0,
      },
      {
        type: DepartmentType.Dental_Surgery,
        machines_type: Machines.LaserSurgeryDevice,
        machines: [
          {
            name: Machines.LaserSurgeryDevice,
            id: 'AMAL-LSR-001',
            location: 'الطابق الثاني - غرفة الجراحة',
          },
          {
            name: Machines.DentalChair,
            id: 'AMAL-DC-003',
            location: 'الطابق الثاني - غرفة الجراحة',
          },
        ],
        operations: [{ name: CommonSurgery.Dental_Implant, id: 'AMAL-OP-005' }],
        nurses: [{ name: 'منار عبد الله القدسي', id: 'AMAL-NRS-003' }],
        numberOfBeds: 0,
      },
    ],
  },

  {
    name: 'مركز الشفاء للعلاج الفيزيائي وإعادة التأهيل',
    address: 'حلب - الأنصاري - شارع الثورة رقم 45',
    cityName: City.Aleppo,
    centerSpecialization: CenterSpecialization.Physiotherapy,
    phones: [
      {
        normal: ['021-3334455', '021-3334456'],
        clinic: ['021-3334457'],
        whatsup: ['0992223344'],
        emergency: [],
      },
    ],
    latitude: 36.1981,
    longitude: 37.1582,
    rating: 4,
    workingHours: WEEKDAY_HOURS,
    departments: [
      {
        type: DepartmentType.Physiotherapy,
        machines_type: Machines.PhysiotherapyEquipment,
        machines: [
          {
            name: Machines.PhysiotherapyEquipment,
            id: 'SHFA-PHY-001',
            location: 'الطابق الأول - قاعة العلاج الفيزيائي',
          },
          {
            name: Machines.PhysiotherapyEquipment,
            id: 'SHFA-PHY-002',
            location: 'الطابق الأول - قاعة العلاج الفيزيائي - جهاز 2',
          },
          {
            name: Machines.ClinicalDiagnosticEquipment,
            id: 'SHFA-CDX-001',
            location: 'الطابق الأول - غرفة التشخيص',
          },
        ],
        operations: [],
        nurses: [
          { name: 'لمياء الشريف الحلبية', id: 'SHFA-NRS-001' },
          { name: 'جمال الدين الزكي الرفاعي', id: 'SHFA-NRS-002' },
          { name: 'مروى حسن الأحمدي', id: 'SHFA-NRS-003' },
        ],
        numberOfBeds: 0,
      },
      {
        type: DepartmentType.Rehabilitation,
        machines_type: Machines.PhysiotherapyEquipment,
        machines: [
          {
            name: Machines.PhysiotherapyEquipment,
            id: 'SHFA-PHY-003',
            location: 'الطابق الثاني - قاعة إعادة التأهيل',
          },
        ],
        operations: [],
        nurses: [
          { name: 'غادة الحموي الكردية', id: 'SHFA-NRS-004' },
          { name: 'أسامة الجيوسي التركماني', id: 'SHFA-NRS-005' },
        ],
        numberOfBeds: 5,
      },
    ],
  },

  {
    name: 'مركز الصحة النفسية والإرشاد النفسي',
    address: 'حمص - الزهراء - شارع القوتلي رقم 8',
    cityName: City.Homs,
    centerSpecialization: CenterSpecialization.Psychiatry,
    phones: [
      {
        normal: ['031-5556677', '031-5556678'],
        clinic: ['031-5556679'],
        whatsup: ['0993334455'],
        emergency: ['031-5556699'],
      },
    ],
    latitude: 34.7189,
    longitude: 36.7091,
    rating: 4,
    workingHours: [
      { day: Days.SUNDAY, from: '09:00', to: '18:00' },
      { day: Days.MONDAY, from: '09:00', to: '18:00' },
      { day: Days.TUESDAY, from: '09:00', to: '18:00' },
      { day: Days.WEDNESDAY, from: '09:00', to: '18:00' },
      { day: Days.THURSDAY, from: '09:00', to: '14:00' },
    ],
    departments: [
      {
        type: DepartmentType.Psychologist,
        machines_type: Machines.ClinicalDiagnosticEquipment,
        machines: [
          {
            name: Machines.ClinicalDiagnosticEquipment,
            id: 'PSYH-CDX-001',
            location: 'الطابق الأول - غرفة الاستشارة 1',
          },
          {
            name: Machines.ClinicalDiagnosticEquipment,
            id: 'PSYH-CDX-002',
            location: 'الطابق الأول - غرفة الاستشارة 2',
          },
          {
            name: Machines.EEGMachine,
            id: 'PSYH-EEG-001',
            location: 'الطابق الثاني - مختبر التشخيص العصبي',
          },
        ],
        operations: [],
        nurses: [
          { name: 'رولا العيسى الحمصية', id: 'PSYH-NRS-001' },
          { name: 'زياد الصفدي الوطني', id: 'PSYH-NRS-002' },
        ],
        numberOfBeds: 0,
      },
    ],
  },

  {
    name: 'مركز التصوير الطبي والأشعة التشخيصية',
    address: 'دمشق - كفرسوسة - شارع تشرين جانب مجمع الرياض',
    cityName: City.Damascus,
    centerSpecialization: CenterSpecialization.Radiology,
    phones: [
      {
        normal: ['011-2114363', '011-2114364'],
        clinic: ['011-2114365'],
        whatsup: ['0994445566'],
        emergency: [],
      },
    ],
    latitude: 33.4957,
    longitude: 36.2818,
    rating: 5,
    workingHours: [
      { day: Days.SUNDAY, from: '08:00', to: '20:00' },
      { day: Days.MONDAY, from: '08:00', to: '20:00' },
      { day: Days.TUESDAY, from: '08:00', to: '20:00' },
      { day: Days.WEDNESDAY, from: '08:00', to: '20:00' },
      { day: Days.THURSDAY, from: '08:00', to: '18:00' },
      { day: Days.SATURDAY, from: '09:00', to: '14:00' },
    ],
    departments: [
      {
        type: DepartmentType.Radiology,
        machines_type: Machines.CTScanner,
        machines: [
          {
            name: Machines.CTScanner,
            id: 'RADY-CTS-001',
            location: 'الطابق الأول - قسم الطبقي المحوري',
          },
          {
            name: Machines.MRIMachine,
            id: 'RADY-MRI-001',
            location: 'الطابق الأول - قسم الرنين المغناطيسي',
          },
          {
            name: Machines.XRayMachine,
            id: 'RADY-XRY-001',
            location: 'الطابق الأرضي - قسم الأشعة السينية',
          },
          {
            name: Machines.UltrasoundMachine,
            id: 'RADY-ULT-001',
            location: 'الطابق الأرضي - قسم السونار',
          },
          {
            name: Machines.MammographyMachine,
            id: 'RADY-MAM-001',
            location: 'الطابق الأول - قسم تصوير الثدي',
          },
        ],
        operations: [],
        nurses: [
          { name: 'إياد الكلاس الدمشقي', id: 'RADY-NRS-001' },
          { name: 'ختام الشيخ الغساني', id: 'RADY-NRS-002' },
          { name: 'بشرى نجيب الأموي', id: 'RADY-NRS-003' },
        ],
        numberOfBeds: 0,
      },
      {
        type: DepartmentType.MRI,
        machines_type: Machines.MRIMachine,
        machines: [
          {
            name: Machines.MRIMachine,
            id: 'RADY-MRI-002',
            location: 'الطابق الأول - قسم الرنين المغناطيسي - جهاز احتياطي',
          },
        ],
        operations: [],
        nurses: [{ name: 'شادي الملوحي الأنصاري', id: 'RADY-NRS-004' }],
        numberOfBeds: 0,
      },
    ],
  },

  {
    name: 'مركز غسيل الكلى والرعاية التخصصية',
    address: 'اللاذقية - الرمل الشمالي - شارع شاطئ الأزرق',
    cityName: City.Latakia,
    centerSpecialization: CenterSpecialization.Dialysis,
    phones: [
      {
        normal: ['041-4445566', '041-4445567'],
        clinic: [],
        whatsup: ['0995556677'],
        emergency: ['041-4445599'],
      },
    ],
    latitude: 35.5389,
    longitude: 35.7823,
    rating: 4,
    workingHours: [
      { day: Days.SUNDAY, from: '07:00', to: '19:00' },
      { day: Days.MONDAY, from: '07:00', to: '19:00' },
      { day: Days.TUESDAY, from: '07:00', to: '19:00' },
      { day: Days.WEDNESDAY, from: '07:00', to: '19:00' },
      { day: Days.THURSDAY, from: '07:00', to: '19:00' },
      { day: Days.SATURDAY, from: '07:00', to: '13:00' },
    ],
    departments: [
      {
        type: DepartmentType.Dialysis,
        machines_type: Machines.DialysisMachine,
        machines: [
          {
            name: Machines.DialysisMachine,
            id: 'DIAL-DLY-001',
            location: 'الطابق الأول - قاعة الغسيل الكلوي - مقعد 1',
          },
          {
            name: Machines.DialysisMachine,
            id: 'DIAL-DLY-002',
            location: 'الطابق الأول - قاعة الغسيل الكلوي - مقعد 2',
          },
          {
            name: Machines.DialysisMachine,
            id: 'DIAL-DLY-003',
            location: 'الطابق الأول - قاعة الغسيل الكلوي - مقعد 3',
          },
          {
            name: Machines.DialysisMachine,
            id: 'DIAL-DLY-004',
            location: 'الطابق الأول - قاعة الغسيل الكلوي - مقعد 4',
          },
          {
            name: Machines.BloodAnalyzer,
            id: 'DIAL-BLD-001',
            location: 'الطابق الأول - مختبر الدم المرافق',
          },
        ],
        operations: [],
        nurses: [
          { name: 'حيدر الشيخ عيسى اللاذقاني', id: 'DIAL-NRS-001' },
          { name: 'عبير صالح البحري', id: 'DIAL-NRS-002' },
          { name: 'يامن الداود الساحلي', id: 'DIAL-NRS-003' },
          { name: 'أميرة خليل الزعيم', id: 'DIAL-NRS-004' },
        ],
        numberOfBeds: 4,
      },
      {
        type: DepartmentType.Blood_Lab,
        machines_type: Machines.BloodAnalyzer,
        machines: [
          {
            name: Machines.BloodAnalyzer,
            id: 'DIAL-BLD-002',
            location: 'الطابق الأول - مختبر الدم',
          },
          {
            name: Machines.UrineAnalyzer,
            id: 'DIAL-URI-001',
            location: 'الطابق الأول - مختبر البول',
          },
          {
            name: Machines.BiochemistryAnalyzer,
            id: 'DIAL-BCH-001',
            location: 'الطابق الأول - مختبر الكيمياء الحيوية',
          },
        ],
        operations: [],
        nurses: [{ name: 'رافع القنطار الحلبي', id: 'DIAL-NRS-005' }],
        numberOfBeds: 0,
      },
    ],
  },

  {
    name: 'مركز مختبر التحاليل الطبية الشامل',
    address: 'ريف دمشق - جرمانا - الشارع الرئيسي بجانب البلدية',
    cityName: City.RifDimashq,
    centerSpecialization: CenterSpecialization.Laboratory,
    phones: [
      {
        normal: ['011-5432100', '011-5432101'],
        clinic: [],
        whatsup: ['0996667788'],
        emergency: [],
      },
    ],
    latitude: 33.4813,
    longitude: 36.3421,
    rating: 4,
    workingHours: [
      { day: Days.SUNDAY, from: '07:30', to: '20:00' },
      { day: Days.MONDAY, from: '07:30', to: '20:00' },
      { day: Days.TUESDAY, from: '07:30', to: '20:00' },
      { day: Days.WEDNESDAY, from: '07:30', to: '20:00' },
      { day: Days.THURSDAY, from: '07:30', to: '17:00' },
      { day: Days.SATURDAY, from: '08:00', to: '14:00' },
    ],
    departments: [
      {
        type: DepartmentType.Blood_Lab,
        machines_type: Machines.BloodAnalyzer,
        machines: [
          {
            name: Machines.BloodAnalyzer,
            id: 'LABS-BLD-001',
            location: 'الطابق الأرضي - مختبر الدم - جهاز 1',
          },
          {
            name: Machines.BloodAnalyzer,
            id: 'LABS-BLD-002',
            location: 'الطابق الأرضي - مختبر الدم - جهاز 2',
          },
          {
            name: Machines.BiochemistryAnalyzer,
            id: 'LABS-BCH-001',
            location: 'الطابق الأرضي - مختبر الكيمياء الحيوية',
          },
        ],
        operations: [],
        nurses: [
          { name: 'جهاد الكيلاني الريفي', id: 'LABS-NRS-001' },
          { name: 'سندس ملحم الجرماني', id: 'LABS-NRS-002' },
        ],
        numberOfBeds: 0,
      },
      {
        type: DepartmentType.Urine_Lab,
        machines_type: Machines.UrineAnalyzer,
        machines: [
          {
            name: Machines.UrineAnalyzer,
            id: 'LABS-URI-001',
            location: 'الطابق الأرضي - مختبر البول',
          },
        ],
        operations: [],
        nurses: [{ name: 'نوار محمد الأحمد', id: 'LABS-NRS-003' }],
        numberOfBeds: 0,
      },
    ],
  },

  {
    name: 'مركز طب النساء والتوليد التخصصي',
    address: 'حماة - المرادي - شارع الاستقلال رقم 7',
    cityName: City.Hama,
    centerSpecialization: CenterSpecialization.ObstetricsGynecology,
    phones: [
      {
        normal: ['033-6667788', '033-6667789'],
        clinic: ['033-6667790'],
        whatsup: ['0997778899'],
        emergency: ['033-6667799'],
      },
    ],
    latitude: 35.1421,
    longitude: 36.7523,
    rating: 5,
    workingHours: EXTENDED_HOURS,
    departments: [
      {
        type: DepartmentType.Gynecology_Obstetrics,
        machines_type: Machines.UltrasoundMachine,
        machines: [
          {
            name: Machines.UltrasoundMachine,
            id: 'GYNO-ULT-001',
            location: 'الطابق الأول - عيادة النساء 1',
          },
          {
            name: Machines.UltrasoundMachine,
            id: 'GYNO-ULT-002',
            location: 'الطابق الأول - عيادة النساء 2',
          },
          {
            name: Machines.ClinicalDiagnosticEquipment,
            id: 'GYNO-CDX-001',
            location: 'الطابق الأول - غرفة التشخيص',
          },
        ],
        operations: [
          { name: CommonSurgery.Cesarean_Section, id: 'GYNO-OP-001' },
          { name: CommonSurgery.Women_Obstetrics_Surgery, id: 'GYNO-OP-002' },
          { name: CommonSurgery.Infertility_Surgery, id: 'GYNO-OP-003' },
        ],
        nurses: [
          { name: 'ميسون الأحمد الحموية', id: 'GYNO-NRS-001' },
          { name: 'تيسير خير بك الحموي', id: 'GYNO-NRS-002' },
          { name: 'وفاء الديري القحطاني', id: 'GYNO-NRS-003' },
          { name: 'إلهام مصطفى الأزهري', id: 'GYNO-NRS-004' },
        ],
        numberOfBeds: 12,
      },
      {
        type: DepartmentType.Infertility_Clinic,
        machines_type: Machines.UltrasoundMachine,
        machines: [
          {
            name: Machines.UltrasoundMachine,
            id: 'GYNO-ULT-003',
            location: 'الطابق الثاني - عيادة العقم',
          },
          {
            name: Machines.ClinicalDiagnosticEquipment,
            id: 'GYNO-CDX-002',
            location: 'الطابق الثاني - مختبر التشخيص',
          },
        ],
        operations: [
          { name: CommonSurgery.Infertility_Surgery, id: 'GYNO-OP-004' },
        ],
        nurses: [{ name: 'ديانا الصباغ الحموية', id: 'GYNO-NRS-005' }],
        numberOfBeds: 4,
      },
    ],
  },

  {
    name: 'مركز طب الأطفال وحديثي الولادة',
    address: 'حلب - الراشدين - شارع الملعب الدولي',
    cityName: City.Aleppo,
    centerSpecialization: CenterSpecialization.Pediatrics,
    phones: [
      {
        normal: ['021-7778899', '021-7778900'],
        clinic: ['021-7778901'],
        whatsup: ['0998889900'],
        emergency: ['021-7778911'],
      },
    ],
    latitude: 36.1821,
    longitude: 37.0943,
    rating: 4,
    workingHours: WEEKDAY_HOURS,
    departments: [
      {
        type: DepartmentType.Pediatrics,
        machines_type: Machines.PulseOximeter,
        machines: [
          {
            name: Machines.PulseOximeter,
            id: 'PEDI-OXI-001',
            location: 'الطابق الأول - عيادة الأطفال',
          },
          {
            name: Machines.Nebulizer,
            id: 'PEDI-NEB-001',
            location: 'الطابق الأول - عيادة الأطفال',
          },
          {
            name: Machines.Thermometer,
            id: 'PEDI-THM-001',
            location: 'الطابق الأول - استقبال الأطفال',
          },
          {
            name: Machines.UltrasoundMachine,
            id: 'PEDI-ULT-001',
            location: 'الطابق الأول - قسم التصوير للأطفال',
          },
        ],
        operations: [],
        nurses: [
          { name: 'رغداء الحاج علي الحلبية', id: 'PEDI-NRS-001' },
          { name: 'مازن خيربك الشامي', id: 'PEDI-NRS-002' },
          { name: 'آلاء حمدان الكردي', id: 'PEDI-NRS-003' },
        ],
        numberOfBeds: 8,
      },
      {
        type: DepartmentType.Neonatology,
        machines_type: Machines.PulseOximeter,
        machines: [
          {
            name: Machines.PulseOximeter,
            id: 'PEDI-OXI-002',
            location: 'الطابق الثاني - وحدة حديثي الولادة',
          },
          {
            name: Machines.Ventilator,
            id: 'PEDI-VNT-001',
            location: 'الطابق الثاني - وحدة حديثي الولادة',
          },
        ],
        operations: [],
        nurses: [
          { name: 'أميمة النجار الأنصارية', id: 'PEDI-NRS-004' },
          { name: 'حمدي البيطار الساحلي', id: 'PEDI-NRS-005' },
        ],
        numberOfBeds: 6,
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDoctors(count: number, specIds: Types.ObjectId[]): DoctorEntry[] {
  const arabicDoctorNames = [
    'د. فاطمة الحسيني',
    'د. عبد الله النجار',
    'د. خلود الراشد',
    'د. يحيى الجراح',
    'د. رنا الزعبي',
    'د. إبراهيم الكيلاني',
    'د. هبة الصالح',
    'د. وسام الأشقر',
    'د. سوزان الحموي',
    'د. نضال الديب',
  ];

  return Array.from({ length: count }).map((_, i) => {
    const entry: DoctorEntry = {
      name: arabicDoctorNames[i % arabicDoctorNames.length] + ` (${i + 1})`,
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
  console.log('\n🏢 [CenterSeeder] Starting center seed...\n');

  const app = await NestFactory.createApplicationContext(DatabaseModule);

  try {
    const centerModel = app.get<Model<Center>>(getModelToken('Center'));
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
        '⚠️  [CenterSeeder] No PrivateSpecialization docs found — ' +
          'doctors will be seeded without a specialization reference.',
      );
    }

    let insertedCenters = 0;
    let skippedCenters = 0;
    let insertedDepartments = 0;
    let skippedDepartments = 0;

    for (const blueprint of CENTERS) {
      // ── Resolve cityId ────────────────────────────────────────────────────
      const city = await cityModel.findOne({ name: blueprint.cityName }).lean();

      if (!city) {
        console.warn(
          `⚠️  [CenterSeeder] City "${blueprint.cityName}" not found — ` +
            `skipping center "${blueprint.name}". Seed cities first.`,
        );
        skippedCenters++;
        continue;
      }

      // ── Idempotency: skip if center already exists by name ────────────────
      const existing = await centerModel
        .findOne({ name: blueprint.name })
        .lean();

      let centerId: Types.ObjectId;

      if (existing) {
        console.log(
          `⏭️  [CenterSeeder] Already exists: "${blueprint.name}" — skipping insert.`,
        );
        centerId = existing._id as Types.ObjectId;
        skippedCenters++;
      } else {
        const inserted = await centerModel.create({
          authAccountId: new Types.ObjectId(),
          name: blueprint.name,
          address: blueprint.address,
          cityId: city._id,
          centerSpecialization: blueprint.centerSpecialization,
          phones: blueprint.phones,
          latitude: blueprint.latitude,
          longitude: blueprint.longitude,
          rating: blueprint.rating,
          workingHours: blueprint.workingHours,
          approvalStatus: ApprovalStatus.APPROVED,
          gallery: [],
          searchCount: 0,
          profileViews: 0,
          isSubscribed: false,
        });

        centerId = inserted._id as Types.ObjectId;
        console.log(
          `✅ [CenterSeeder] Inserted: "${blueprint.name}" (${centerId})`,
        );
        insertedCenters++;
      }

      // ── Seed CommonDepartments for this center ────────────────────────────
      for (const dept of blueprint.departments) {
        const deptExists = await departmentModel
          .findOne({ centerId, type: dept.type })
          .lean();

        if (deptExists) {
          console.log(
            `  ⏭️  [CenterSeeder] Department "${dept.type}" already exists ` +
              `for "${blueprint.name}" — skipping.`,
          );
          skippedDepartments++;
          continue;
        }

        await departmentModel.create({
          centerId,
          type: dept.type,
          machines_type: dept.machines_type,
          machines: dept.machines,
          operations: dept.operations,
          nurses: dept.nurses,
          numberOfBeds: dept.numberOfBeds,
          doctors: buildDoctors(3, specIds),
        });

        console.log(
          `  ➕ [CenterSeeder] Created department "${dept.type}" ` +
            `for "${blueprint.name}"`,
        );
        insertedDepartments++;
      }
    }

    console.log('\n─────────────────────────────────────────────────────');
    console.log(
      `🏢 Centers    — inserted: ${insertedCenters}, skipped: ${skippedCenters}`,
    );
    console.log(
      `🏗️  Departments — inserted: ${insertedDepartments}, skipped: ${skippedDepartments}`,
    );
    console.log('✅ [CenterSeeder] Done.\n');
  } finally {
    await app.close();
  }
}

seed().catch((err: Error) => {
  console.error('❌ [CenterSeeder] Fatal error:', err.message);
  process.exit(1);
});
