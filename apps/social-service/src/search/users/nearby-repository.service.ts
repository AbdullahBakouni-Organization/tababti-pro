import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { calculateDistanceKm } from '../../common/utiles/distance.util';
import { buildSmartRegex } from '../../common/utiles/formatname.util';
import { escapeRegex } from '@app/common/utils/escape-regex.util';
import { ApprovalStatus } from '@app/common/database/schemas/common.enums';
import { NearbyCache } from './nearby-cache.service';
import {
  NearbyFilters,
  DoctorRaw,
  HospitalRaw,
  CenterRaw,
} from './types/nearby.types';

// ─── Cache TTLs (seconds) ──────────────────────────────────────────────────────
const TTL_DOCTOR = 300; // 5 min
const TTL_HOSPITAL = 300; // 5 min
const TTL_CENTER = 300; // 5 min
const TTL_DEPT = 600; // 10 min

@Injectable()
export class NearbyRepository {
  constructor(
    @InjectModel('Doctor') private readonly doctorModel: Model<DoctorRaw>,
    @InjectModel('Hospital') private readonly hospitalModel: Model<HospitalRaw>,
    @InjectModel('Center') private readonly centerModel: Model<CenterRaw>,
    @InjectModel('PublicSpecialization')
    @InjectModel('CommonDepartment')
    private readonly deptModel: Model<any>,
    private readonly cache: NearbyCache,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCTORS
  // ═══════════════════════════════════════════════════════════════════════════

  async getDoctorsInRadius(
    lat: number,
    lng: number,
    radiusKm: number,
    filters: NearbyFilters,
  ): Promise<any[]> {
    const safePrivate = (filters.privateSpecializations ?? []).filter(Boolean);

    const filterKey = [
      'doctors',
      filters.doctorName ? `name:${filters.doctorName}` : '',
      filters.cityId ? `city:${filters.cityId}` : '',
      filters.publicSpecialization ? `pub:${filters.publicSpecialization}` : '',
      safePrivate.length ? `priv:${[...safePrivate].sort().join(',')}` : '',
      filters.gender ? `g:${filters.gender}` : '',
      filters.minPrice != null ? `minP:${filters.minPrice}` : '',
      filters.maxPrice != null ? `maxP:${filters.maxPrice}` : '',
      filters.minRating != null ? `minR:${filters.minRating}` : '',
      filters.maxRating != null ? `maxR:${filters.maxRating}` : '',
    ]
      .filter(Boolean)
      .join(':');

    const cacheKey = this.cache.gridKey(lat, lng, filterKey, radiusKm);

    return this.cache.get(
      cacheKey,
      async () => {
        const query: Record<string, any> = {
          latitude: { $ne: null },
          longitude: { $ne: null },
          status: ApprovalStatus.APPROVED,
        };

        if (filters.cityId) {
          query.cityId = new Types.ObjectId(filters.cityId);
        }

        const nameConditions: Record<string, any>[] = [];
        if (filters.doctorName) {
          const rx = buildSmartRegex(filters.doctorName);
          nameConditions.push(
            { firstName: rx },
            { middleName: rx },
            { lastName: rx },
          );
        }

        if (filters.publicSpecialization) {
          query.publicSpecialization = filters.publicSpecialization;
        }

        const privOrConditions: Record<string, any>[] = [];
        if (safePrivate.length > 0) {
          for (const term of safePrivate) {
            privOrConditions.push(
              { privateSpecialization: term },
              { privateSpecialization: buildSmartRegex(term) },
            );
          }
        }

        const hasName = nameConditions.length > 0;
        const hasPriv = privOrConditions.length > 0;

        if (hasName && hasPriv) {
          query.$and = [{ $or: nameConditions }, { $or: privOrConditions }];
        } else if (hasName) {
          query.$or = nameConditions;
        } else if (hasPriv) {
          query.$or = privOrConditions;
        }

        if (filters.gender) {
          query.gender = filters.gender;
        }

        if (filters.minPrice != null || filters.maxPrice != null) {
          query.inspectionPrice = {};
          if (filters.minPrice != null)
            query.inspectionPrice.$gte = filters.minPrice;
          if (filters.maxPrice != null)
            query.inspectionPrice.$lte = filters.maxPrice;
        }

        if (filters.minRating != null || filters.maxRating != null) {
          query.rating = {};
          if (filters.minRating != null) query.rating.$gte = filters.minRating;
          if (filters.maxRating != null) query.rating.$lte = filters.maxRating;
        }

        const docs = await this.doctorModel
          .find(query)
          .select({
            firstName: 1,
            middleName: 1,
            lastName: 1,
            yearsOfExperience: 1,
            phones: 1,
            image: 1,
            latitude: 1,
            longitude: 1,
            rating: 1,
            gender: 1,
            inspectionPrice: 1,
            inspectionDuration: 1,
            workingHours: 1,
            address: 1,
            bio: 1,
            cityId: 1,
            city: 1,
            subcity: 1,
            status: 1,
            hospitals: 1,
            centers: 1,
            insuranceCompanies: 1,
            publicSpecializationId: 1,
            privateSpecializationId: 1,
            publicSpecialization: 1,
            privateSpecialization: 1,
          })
          .populate('publicSpecializationId', 'name')
          .populate('privateSpecializationId', 'name')
          .lean()
          .exec();

        return this.filterAndSort(docs, lat, lng, radiusKm, 'doctor');
      },
      TTL_DOCTOR,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HOSPITALS
  // ═══════════════════════════════════════════════════════════════════════════

  async getHospitalsInRadius(
    lat: number,
    lng: number,
    radiusKm: number,
    filters: NearbyFilters,
  ): Promise<any[]> {
    const filterKey = [
      'hospitals',
      filters.cityId ? `city:${filters.cityId}` : '',
      filters.hospitalName ? `n:${filters.hospitalName}` : '',
      filters.hospitalCategory ? `c:${filters.hospitalCategory}` : '',
      filters.hospitalStatus ? `s:${filters.hospitalStatus}` : '',
      filters.hospitalSpecialization
        ? `sp:${filters.hospitalSpecialization}`
        : '',
      filters.minRating != null ? `minR:${filters.minRating}` : '',
      filters.maxRating != null ? `maxR:${filters.maxRating}` : '',
      filters.departments?.length
        ? `dep:${[...filters.departments].sort().join(',')}`
        : '',
      filters.operations?.length
        ? `op:${[...filters.operations].sort().join(',')}`
        : '',
      filters.machines?.length
        ? `mc:${[...filters.machines].sort().join(',')}`
        : '',
    ]
      .filter(Boolean)
      .join(':');

    const cacheKey = this.cache.gridKey(lat, lng, filterKey, radiusKm);

    return this.cache.get(
      cacheKey,
      async () => {
        const entityIdFilter = await this.resolveDeptEntityIds(
          filters,
          'hospitalId',
        );
        if (entityIdFilter === null) return [];

        const query: Record<string, any> = {
          latitude: { $ne: null },
          longitude: { $ne: null },
        };

        if (entityIdFilter) query._id = { $in: entityIdFilter };
        if (filters.cityId) query.cityId = new Types.ObjectId(filters.cityId);
        if (filters.hospitalName)
          query.name = {
            $regex: escapeRegex(filters.hospitalName),
            $options: 'i',
          };
        if (filters.hospitalCategory) query.category = filters.hospitalCategory;
        if (filters.hospitalStatus)
          query.hospitalstatus = filters.hospitalStatus;
        if (filters.hospitalSpecialization)
          query.hospitalSpecialization = filters.hospitalSpecialization;

        if (filters.minRating != null || filters.maxRating != null) {
          query.rating = {};
          if (filters.minRating != null) query.rating.$gte = filters.minRating;
          if (filters.maxRating != null) query.rating.$lte = filters.maxRating;
        }

        const hospitals = await this.hospitalModel
          .find(query)
          .select({
            name: 1,
            address: 1,
            bio: 1,
            category: 1,
            hospitalstatus: 1,
            hospitalSpecialization: 1,
            status: 1,
            cityId: 1,
            phones: 1,
            image: 1,
            rating: 1,
            latitude: 1,
            longitude: 1,
            insuranceCompanies: 1,
          })
          .lean()
          .exec();

        const sorted = this.filterAndSort(
          hospitals,
          lat,
          lng,
          radiusKm,
          'hospital',
        );
        // Pass filters so only matching departments are attached (not ALL departments)
        return this.enrichWithDepartments(sorted, 'hospitalId', filters);
      },
      TTL_HOSPITAL,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CENTERS
  // ═══════════════════════════════════════════════════════════════════════════

  async getCentersInRadius(
    lat: number,
    lng: number,
    radiusKm: number,
    filters: NearbyFilters,
  ): Promise<any[]> {
    const filterKey = [
      'centers',
      filters.cityId ? `city:${filters.cityId}` : '',
      filters.centerSpecialization
        ? `sp:${filters.centerSpecialization}`
        : 'all',
      filters.centerName ? `n:${filters.centerName}` : '',
      filters.minRating != null ? `minR:${filters.minRating}` : '',
      filters.maxRating != null ? `maxR:${filters.maxRating}` : '',
      filters.departments?.length
        ? `dep:${[...filters.departments].sort().join(',')}`
        : '',
      filters.operations?.length
        ? `op:${[...filters.operations].sort().join(',')}`
        : '',
      filters.machines?.length
        ? `mc:${[...filters.machines].sort().join(',')}`
        : '',
    ]
      .filter(Boolean)
      .join(':');

    const cacheKey = this.cache.gridKey(lat, lng, filterKey, radiusKm);

    return this.cache.get(
      cacheKey,
      async () => {
        const entityIdFilter = await this.resolveDeptEntityIds(
          filters,
          'centerId',
        );
        if (entityIdFilter === null) return [];

        const query: Record<string, any> = {
          latitude: { $ne: null },
          longitude: { $ne: null },
        };

        if (entityIdFilter) query._id = { $in: entityIdFilter };
        if (filters.cityId) query.cityId = new Types.ObjectId(filters.cityId);
        if (filters.centerSpecialization)
          query.centerSpecialization = filters.centerSpecialization;
        if (filters.centerName)
          query.name = {
            $regex: escapeRegex(filters.centerName),
            $options: 'i',
          };

        if (filters.minRating != null || filters.maxRating != null) {
          query.rating = {};
          if (filters.minRating != null) query.rating.$gte = filters.minRating;
          if (filters.maxRating != null) query.rating.$lte = filters.maxRating;
        }

        const centers = await this.centerModel
          .find(query)
          .select({
            name: 1,
            address: 1,
            latitude: 1, // ✅ ADD THIS
            longitude: 1, // ✅ ADD THIS
            bio: 1,
            centerSpecialization: 1,
            cityId: 1,
            image: 1,
          })
          .lean()
          .exec();

        const sorted = this.filterAndSort(
          centers,
          lat,
          lng,
          radiusKm,
          'center',
        );
        // Pass filters so only matching departments are attached (not ALL departments)
        return this.enrichWithDepartments(sorted, 'centerId', filters);
      },
      TTL_CENTER,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPARTMENT / OPERATION / MACHINE RESOLUTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Resolves entity IDs that match the department/machine/operation filters.
   *
   * Department AND logic: if ['A','B'] sent → entity must have dept type A AND dept type B.
   * Each type is a separate CommonDepartment document → results are intersected per type.
   *
   * Machine / operation OR logic: entity must have at least one matching entry.
   *
   * Returns:
   *   undefined        → no dept filters active at all; caller skips _id restriction
   *   null  ([] → null)→ filters active but zero matches; caller short-circuits with []
   *   ObjectId[]       → IDs of entities that satisfy all dept filters
   */
  private async resolveDeptEntityIds(
    filters: NearbyFilters,
    ownerField: 'hospitalId' | 'centerId',
  ): Promise<Types.ObjectId[] | null | undefined> {
    const hasDept = !!filters.departments?.length;
    const hasOps = !!filters.operations?.length;
    const hasMachines = !!filters.machines?.length;

    if (!hasDept && !hasOps && !hasMachines) return undefined;

    const cacheKey = `dept:${ownerField}:${[
      hasDept ? `dep:${[...filters.departments!].sort().join(',')}` : '',
      hasOps ? `op:${[...filters.operations!].sort().join(',')}` : '',
      hasMachines ? `mc:${[...filters.machines!].sort().join(',')}` : '',
    ]
      .filter(Boolean)
      .join(':')}`;

    const ids = await this.cache.get<Types.ObjectId[]>(
      cacheKey,
      async () => {
        // ── Multiple department types: intersect result sets per type ──────────
        if (hasDept && filters.departments!.length > 1) {
          let candidateIds: Set<string> | null = null;

          for (const deptType of filters.departments!) {
            const q: Record<string, any> = {
              [ownerField]: { $exists: true, $ne: null },
              type: deptType,
            };
            if (hasMachines) q['machines.name'] = { $in: filters.machines };
            if (hasOps) q['operations.name'] = { $in: filters.operations };

            const batchIds = (await this.deptModel
              .find(q)
              .distinct(ownerField)) as Types.ObjectId[];

            const batchSet = new Set(batchIds.map((id) => id.toString()));

            if (candidateIds === null) {
              candidateIds = batchSet;
            } else {
              for (const id of candidateIds) {
                if (!batchSet.has(id)) candidateIds.delete(id);
              }
            }

            if (candidateIds.size === 0) return [];
          }

          return (candidateIds ? [...candidateIds] : []).map(
            (id) => new Types.ObjectId(id),
          );
        }

        // ── Single department type or only ops/machines ────────────────────────
        const q: Record<string, any> = {
          [ownerField]: { $exists: true, $ne: null },
        };
        if (hasDept) q.type = { $in: filters.departments };
        if (hasMachines) q['machines.name'] = { $in: filters.machines };
        if (hasOps) q['operations.name'] = { $in: filters.operations };

        return this.deptModel.find(q).distinct(ownerField) as Promise<
          Types.ObjectId[]
        >;
      },
      TTL_DEPT,
    );

    return ids.length ? ids : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENRICH WITH DEPARTMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Attaches a `departments` array to every entity.
   *
   * When department/operation/machine filters are active, ONLY the matching
   * department documents are attached — not every department the entity owns.
   * This keeps the response accurate: you asked for "طب الأسنان" so you only
   * see the dental department, not cardiac/ICU/etc. that happen to co-exist.
   *
   * When no filters are active, all departments for the entity are returned.
   */
  private async enrichWithDepartments(
    entities: any[],
    ownerField: 'hospitalId' | 'centerId',
    filters: NearbyFilters = {},
  ): Promise<any[]> {
    if (!entities.length) return entities;

    const hasDept = !!filters.departments?.length;
    const hasOps = !!filters.operations?.length;
    const hasMachines = !!filters.machines?.length;
    const hasAnyDeptFilter = hasDept || hasOps || hasMachines;

    const ids = entities.map((e) => e._id);

    // ── Build the department fetch query ─────────────────────────────────────
    // Always scope to matched entity IDs.
    // When filters are active, also scope to exactly matching dept docs so the
    // response only contains departments relevant to what the user searched for.
    const deptQuery: Record<string, any> = {
      [ownerField]: { $in: ids },
    };

    if (hasAnyDeptFilter) {
      const conditions: Record<string, any>[] = [];

      // Scope to matching department type(s)
      if (hasDept) conditions.push({ type: { $in: filters.departments } });
      // Scope to docs that contain at least one matching machine
      if (hasMachines)
        conditions.push({ 'machines.name': { $in: filters.machines } });
      // Scope to docs that contain at least one matching operation
      if (hasOps)
        conditions.push({ 'operations.name': { $in: filters.operations } });

      // All active filter groups must be satisfied by the same department document
      if (conditions.length === 1) {
        Object.assign(deptQuery, conditions[0]);
      } else {
        deptQuery.$and = conditions;
      }
    }

    const depts = await this.deptModel
      .find(deptQuery)
      .select({
        [ownerField]: 1,
        type: 1,
        machines: 1,
        operations: 1,
        doctors: 1,
        nurses: 1,
        numberOfBeds: 1,
        machines_type: 1,
      })
      .lean()
      .exec();

    // Group departments by entity ID
    const deptMap = new Map<string, any[]>();
    for (const dept of depts) {
      const key = dept[ownerField]?.toString();
      if (!key) continue;
      if (!deptMap.has(key)) deptMap.set(key, []);
      deptMap.get(key)!.push({
        id: dept._id,
        type: dept.type,
        machinesType: dept.machines_type,
        machines: dept.machines ?? [],
        operations: dept.operations ?? [],
        doctors: dept.doctors ?? [],
        nurses: dept.nurses ?? [],
        numberOfBeds: dept.numberOfBeds ?? 0,
      });
    }

    return entities.map((entity) => ({
      ...entity,
      departments: deptMap.get(entity._id?.toString()) ?? [],
    }));
  }

  // ─── Straight-line distance filter + sort ─────────────────────────────────────

  private filterAndSort(
    docs: any[],
    lat: number,
    lng: number,
    radiusKm: number,
    entityType: string,
  ): any[] {
    return docs
      .map((d) => ({
        ...d,
        straightLineDistance: calculateDistanceKm(
          lat,
          lng,
          d.latitude,
          d.longitude,
        ),
        entityType,
      }))
      .filter((d) => d.straightLineDistance <= radiusKm)
      .sort((a, b) => a.straightLineDistance - b.straightLineDistance);
  }
}
