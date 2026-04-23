import { Types } from 'mongoose';
import {
  DepartmentType,
  Machines,
  CommonSurgery,
  HospitalCategory,
  HospitalStatus,
  HospitalSpecialization,
  CenterSpecialization,
  GeneralSpecialty,
  PrivateMedicineSpecialty,
  Gender,
} from '@app/common/database/schemas/common.enums';

// ─── Travel ───────────────────────────────────────────────────────────────────

export type TravelMode =
  | 'driving-car'
  | 'driving-hgv'
  | 'foot-walking'
  | 'cycling-regular';

export const FALLBACK_SPEEDS: Record<TravelMode, number> = {
  'driving-car': 40,
  'driving-hgv': 35,
  'foot-walking': 5,
  'cycling-regular': 15,
};

// ─── Raw DB shapes ────────────────────────────────────────────────────────────

export interface BaseEntityRaw {
  _id: Types.ObjectId;
  latitude: number;
  longitude: number;
}

export interface DoctorRaw extends BaseEntityRaw {
  firstName: string;
  middleName: string;
  lastName: string;
  yearsOfExperience?: Date;
  phones: { whatsup: string[]; clinic: string[]; normal: string[] }[];
  image?: string;
  address?: string;
  rating?: number;
  gender?: string;
  inspectionPrice?: number;
  workingHours?: any[];
  publicSpecializationId?: { name: string };
  privateSpecializationIds?: { name: string }[];
}

export interface HospitalRaw extends BaseEntityRaw {
  name: string;
  address: string;
  category: string;
  hospitalstatus: string; // lowercase 's' — matches DB field name
  hospitalSpecialization: string;
  cityId: Types.ObjectId;
  phones: {
    whatsup: string[];
    clinic: string[];
    normal: string[];
    emergency: string[];
  }[];
  image?: string;
  rating?: number;
}

export interface CenterRaw extends BaseEntityRaw {
  name: string;
  address?: string;
  centerSpecialization: string;
  cityId: Types.ObjectId;
  phones: {
    whatsup: string[];
    clinic: string[];
    normal: string[];
    emergency: string[];
  }[];
  image?: string;
  rating?: number;
  workingHours?: { day: string; from: string; to: string }[]; // from/to — NOT startTime/endTime
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface NearbyFilters {
  // ── Shared / location ──────────────────────────────────────────────────────
  cityId?: string;

  // ── Doctor filters ─────────────────────────────────────────────────────────
  /** Free-text search across firstName, middleName, lastName */
  doctorName?: string;

  /**
   * Arabic VALUE from GeneralSpecialty enum.
   * e.g. GeneralSpecialty.HumanMedicine → 'طب بشري'
   * Stored directly as a string on the Doctor document.
   */
  publicSpecialization?: GeneralSpecialty | string;

  /**
   * Arabic VALUES from PrivateMedicineSpecialty enum.
   * e.g. [PrivateMedicineSpecialty.Cardiology] → ['قلب']
   * Stored directly as a string on the Doctor document.
   */
  privateSpecializations?: Array<PrivateMedicineSpecialty | string>;

  /** Gender.MALE ('male') | Gender.FEMALE ('female') */
  gender?: Gender | string;

  /** inspectionPrice >= minPrice */
  minPrice?: number;
  /** inspectionPrice <= maxPrice */
  maxPrice?: number;
  /** rating >= minRating */
  minRating?: number;
  /** rating <= maxRating */
  maxRating?: number;

  // ── Hospital filters ───────────────────────────────────────────────────────
  hospitalName?: string;
  /** HospitalCategory enum value */
  hospitalCategory?: HospitalCategory | string;
  /** HospitalStatus enum value — queried against DB field 'hospitalstatus' */
  hospitalStatus?: HospitalStatus | string;
  /** HospitalSpecialization enum value */
  hospitalSpecialization?: HospitalSpecialization | string;

  // ── Center filters ─────────────────────────────────────────────────────────
  /** CenterSpecialization enum value */
  centerSpecialization?: CenterSpecialization | string;
  centerName?: string;

  // ── CommonDepartment filters (Arabic enum VALUES) ──────────────────────────
  /**
   * DepartmentType enum VALUES (Arabic).
   * e.g. ['الأشعة', 'الطوارئ']
   * AND logic: entity must have ALL listed department types.
   * Each type is a separate CommonDepartment document — resolved via intersection.
   */
  departments?: Array<DepartmentType | string>;

  /**
   * CommonSurgery enum VALUES (Arabic).
   * e.g. ['جراحة عامة']
   * OR logic: entity must have at least one matching operation.
   */
  operations?: Array<CommonSurgery | string>;

  /**
   * Machines enum VALUES (Arabic).
   * e.g. ['جهاز رنين مغناطيسي']
   * OR logic: entity must have at least one matching machine.
   */
  machines?: Array<Machines | string>;
}

// ─── Routing ──────────────────────────────────────────────────────────────────

export interface RoutingData {
  distanceKm: number;
  durationMinutes: number;
  travelMode: TravelMode;
  routeAvailable: boolean;
}

// ─── Re-export NearbyEntity so routing/mapper can import from one place ───────

export type {
  NearbyEntity,
  RouteData,
  RouteSegment,
  MatrixResponse,
  OpenRouteServiceDirectionsResponse,
  ORSGeoJsonResponse,
  PaginatedNearbyResponse,
} from '../../../common/interfaces/nearby.interface';
