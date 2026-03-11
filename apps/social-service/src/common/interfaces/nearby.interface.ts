import type { Types } from 'mongoose';
import type { TravelMode } from '../../search/users/types/nearby.types';

// ─── Route shapes ──────────────────────────────────────────────────────────────

export interface RouteSegment {
  distance: number;
  duration: number;
  instruction: string;
  name: string;
  type: number;
}

export interface RouteData {
  geometry: { type: 'LineString'; coordinates: number[][] };
  segments: RouteSegment[];
  summary: {
    distance: number;
    duration: number;
    distanceText: string;
    durationText: string;
  };
}

// ─── Base ──────────────────────────────────────────────────────────────────────

interface BaseNearbyEntity {
  latitude: number;
  longitude: number;
  distanceKm: number;
  durationMinutes: number;
  travelMode: TravelMode;
  routeAvailable: boolean;
  route?: RouteData;
}

// ─── Doctor ────────────────────────────────────────────────────────────────────

export interface DoctorNearbyEntity extends BaseNearbyEntity {
  entityType: 'doctor';
  id: Types.ObjectId;
  fullName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  gender?: string;
  image?: string;
  address?: string;
  rating?: number;
  bio?: string;
  /** ApprovalStatus enum value */
  status?: string;
  yearsOfExperience?: Date;
  inspectionPrice?: number;
  inspectionDuration?: number;
  cityId?: Types.ObjectId;
  city?: string;
  subcity?: string;
  phones: { whatsup: string[]; clinic: string[]; normal: string[] }[];
  workingHours: any[];
  hospitals: { name: string; id: string; location: string }[];
  centers: { name: string; id: string; location: string }[];
  insuranceCompanies: any[];
  /** Populated name from publicSpecializationId collection */
  publicSpecialization?: string;
  publicSpecializations: string[];
  privateSpecializations: string[];
  /** Raw Arabic string stored directly on Doctor document */
  publicSpecializationStr?: string;
  privateSpecializationStr?: string;
}

// ─── Department info (attached to hospitals & centers) ────────────────────────

export interface DepartmentInfo {
  id: any;
  /** DepartmentType enum VALUE (Arabic) e.g. 'الأشعة' */
  type: string;
  /** Machines enum VALUE for the dominant machine type */
  machinesType: string;
  /** Machines enum VALUES */
  machines: { name: string; id: string; location: string }[];
  /** CommonSurgery enum VALUES */
  operations: { name: string; id: string }[];
  doctors: { name: string; id: string; specialization: any }[];
  nurses: { name: string; id: string }[];
  numberOfBeds: number;
}

// ─── Hospital ──────────────────────────────────────────────────────────────────

export interface HospitalNearbyEntity extends BaseNearbyEntity {
  entityType: 'hospital';
  id: Types.ObjectId;
  name: string;
  address: string;
  bio?: string;
  /** HospitalCategory enum value */
  category: string;
  /** HospitalStatus enum value — DB field name is 'hospitalstatus' (lowercase s) */
  hospitalStatus: string;
  /** HospitalSpecialization enum value */
  hospitalSpecialization: string;
  /** ApprovalStatus enum value — DB field name is 'status' */
  status?: string;
  cityId: Types.ObjectId;
  phones: {
    whatsup: string[];
    clinic: string[];
    normal: string[];
    emergency: string[];
  }[];
  image?: string;
  rating?: number;
  insuranceCompanies: any[];
  departments: DepartmentInfo[];
}

// ─── Center ────────────────────────────────────────────────────────────────────

export interface CenterNearbyEntity extends BaseNearbyEntity {
  entityType: 'center';
  id: Types.ObjectId;
  name: string;
  address?: string;
  bio?: string;
  /** CenterSpecialization enum value */
  centerSpecialization: string;
  /** ApprovalStatus enum value — DB field name is 'approvalStatus' */
  approvalStatus?: string;
  cityId: Types.ObjectId;
  phones: {
    whatsup: string[];
    clinic: string[];
    normal: string[];
    emergency: string[];
  }[];
  image?: string;
  rating?: number;
  /** Uses { from, to } keys — NOT startTime/endTime */
  workingHours: { day: string; from: string; to: string }[];
  departments: DepartmentInfo[];
}

export type NearbyEntity =
  | DoctorNearbyEntity
  | HospitalNearbyEntity
  | CenterNearbyEntity;

// ─── Pagination ────────────────────────────────────────────────────────────────

export interface NearbyMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  counts: { doctors: number; hospitals: number; centers: number };
}

// export interface PaginatedNearbyResponse {
//   data: NearbyEntity[];
//   meta: NearbyMeta;
// }
export interface PaginatedNearbyResponse {
  doctors: { data: NearbyEntity[]; total: number };
  hospitals: { data: NearbyEntity[]; total: number };
  centers: { data: NearbyEntity[]; total: number };
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
// ─── ORS API shapes ────────────────────────────────────────────────────────────

export interface MatrixResponse {
  durations: number[][];
  distances: number[][];
}

export interface OpenRouteServiceDirectionsResponse {
  routes: {
    summary: { distance: number; duration: number };
    geometry: { type: 'LineString'; coordinates: number[][] };
    segments?: {
      steps?: {
        distance: number;
        duration: number;
        instruction: string;
        name?: string;
        type: number;
      }[];
    }[];
  }[];
}

export interface ORSGeoJsonResponse {
  features: {
    geometry: { type: string; coordinates: number[][] };
    properties?: {
      summary?: { distance?: number; duration?: number };
      segments?: any[];
    };
  }[];
}
