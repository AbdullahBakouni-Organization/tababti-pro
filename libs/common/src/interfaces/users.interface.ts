import type { LineString } from 'geojson';
export type TravelMode =
  | 'driving-car'
  | 'driving-hgv'
  | 'foot-walking'
  | 'cycling-regular';

export interface RouteSegment {
  distance: number;
  duration: number;
  instruction: string;
  name: string;
  type: number;
}

export interface DoctorWithRoute {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  fullName: string;
  straightLineDistance?: number;
  yearsOfExperience: number;
  email: string;
  phones: string[];
  image?: string;
  address?: string;
  hospital?: string[];
  publicSpecialization?: {
    id: string;
    name: string;
  };
  privateSpecializations: Array<{
    id: string;
    name: string;
    publicSpecializationId: string;
  }>;
  latitude: number;
  longitude: number;
  distanceKm: number;
  durationMinutes: number;
  travelMode: TravelMode;
  routeAvailable: boolean;
  // route?: {
  //   geometry: RouteGeometry;
  //   segments: RouteSegment[];
  //   summary: {
  //     distance: number;
  //     duration: number;
  //     distanceText: string;
  //     durationText: string;
  //   };
  // };
  route?: RouteData;
}
export interface HospitalWithRoute {
  id: string;
  name: string;
  address?: string;
  category: string;
  status: string;
  city?: string;
  phones: string[];
  NumberOfBeds?: number;
  latitude: number;
  longitude: number;
  distanceKm: number;
  durationMinutes: number;
  travelMode: TravelMode;
  routeAvailable: boolean;
  straightLineDistance?: number;
  route?: RouteData;
  entityType: 'hospital';
}
export type NearbyEntity =
  | DoctorWithRoute
  | HospitalWithRoute
  | CenterWithRoute;

export interface RouteData {
  geometry: {
    type: 'LineString';
    coordinates: number[][];
  };
  segments: RouteSegment[];
  summary: {
    distance: number;
    duration: number;
    distanceText: string;
    durationText: string;
  };
}
export interface PaginatedNearbyResponse {
  data: NearbyEntity[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    counts?: {
      doctors: number;
      hospitals: number;
      centers: number;
    };
  };
}
export interface PaginatedDoctorsResponse {
  data: DoctorWithRoute[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface MatrixResponse {
  durations?: number[][];
  distances?: number[][];
  latitude?: number;
  longitude?: number;
}

export interface OpenRouteServiceDirectionsResponse {
  routes: Array<{
    summary: {
      distance: number;
      duration: number;
    };
    geometry: {
      coordinates: number[][];
      type: string;
    };
    segments: Array<{
      distance: number;
      duration: number;
      steps: Array<{
        distance: number;
        duration: number;
        instruction: string;
        name: string;
        type: number;
      }>;
    }>;
  }>;
}
export interface OrsSummary {
  distance: number;
  duration: number;
}

export interface OrsProperties {
  summary: OrsSummary;
  segments: any; // Consider defining a more specific type for segments if available
}

export interface OrsFeature {
  type: string;
  geometry: any; // Consider defining a more specific type for geometry if available
  properties: OrsProperties;
}

export interface OpenRouteServiceGeoJSON {
  features?: OrsFeature[]; // Make features optional as it might be empty
}
export interface DoctorWhereClause {
  latitude?: {
    not: number | null;
  };

  longitude?: {
    not: number | null;
  };

  publicSpecialization?: {
    not: null;
  };

  privateSpecializations?: {
    not: null;
  };
}
export type EnrichedEntity<T> = T & {
  distanceKm: number;
  durationMinutes: number;
  travelMode: TravelMode;
  routeAvailable: boolean;
  entityType: 'doctor' | 'hospital';
};
export interface DetailedRouteData {
  geometry: string;
  distance: number;
  duration: number;
  // Add other fields returned by your getDetailedRoute method
  route?: RouteData;
}
interface ORSStep {
  distance: number;
  duration: number;
  instruction: string;
  name: string;
  type: number;
}

interface ORSSegment {
  distance: number;
  duration: number;
  steps: ORSStep[];
}

interface ORSFeatureProperties {
  summary?: {
    distance?: number;
    duration?: number;
  };
  segments?: ORSSegment[];
}

interface ORSFeature {
  geometry: LineString;
  properties?: ORSFeatureProperties;
}

export interface ORSGeoJsonResponse {
  features?: ORSFeature[];
}
export interface CenterWithRoute {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  category: string;
  specializations: string[];
  durationMinutes: number;
  city: string | null;
  straightLineDistance?: number;
  entityType: 'center';
  phones: string[];
}
