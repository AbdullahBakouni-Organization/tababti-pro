import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SearchFilterDto } from './dto/search-filter.dto';
import { TranslationAiService } from '../translation-ai/translation-ai.service';
import { CommonDepartment } from '@app/common/database/schemas/common_departments.schema';
import {
  AleppoAreas,
  City,
  ConditionEnum,
  DamascusAreas,
  DaraaAreas,
  DeirEzzorAreas,
  GeneralSpecialty,
  HamaAreas,
  HassakehAreas,
  HomsAreas,
  IdlibAreas,
  LatakiaAreas,
  QuneitraAreas,
  RaqqaAreas,
  SweidaAreas,
  TartousAreas,
} from '@app/common/database/schemas/common.enums';
import { LRUCache } from 'lru-cache';
import DataLoader from 'dataloader';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

interface SearchEnhancementEvent {
  searchTerm: string;
  timestamp: number;
}

@Injectable()
export class SearchService implements OnModuleInit, OnModuleDestroy {
  private searchVariantsCache: LRUCache<string, string[]>;
  private doctorLoader: DataLoader<string, any>;
  private hospitalLoader: DataLoader<string, any>;
  private centerLoader: DataLoader<string, any>;

  // Performance metrics
  private metrics = {
    fastPathHits: 0,
    slowPathHits: 0,
    cacheHits: 0,
    aiEnhancements: 0,
  };

  constructor(
    @InjectModel('Doctor') private readonly doctorModel: Model<any>,
    @InjectModel('Hospital') private readonly hospitalModel: Model<any>,
    @InjectModel('Center') private readonly centerModel: Model<any>,
    @InjectModel('TransliterationCache')
    private readonly transliterationCacheModel: Model<any>,
    @InjectModel('PublicSpecialization')
    private readonly publicSpecializationModel: Model<any>,
    @InjectModel('PrivateSpecialization')
    private readonly privateSpecializationModel: Model<any>,
    private aiService: TranslationAiService,
    private eventEmitter: EventEmitter2,
    //

    @InjectModel(CommonDepartment.name)
    private readonly commonDepartmentModel: Model<CommonDepartment>,
  ) {}

  async onModuleInit() {
    // Initialize aggressive cache
    this.searchVariantsCache = new LRUCache({
      max: 5000,
      ttl: 1000 * 60 * 60 * 24, // 24 hours
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });
    await this.hydrateSearchCacheFromDb();
    this.initializeDataLoaders();
    this.startBackgroundWarmup();
    this.startMetricsReporting();
  }

  onModuleDestroy() {
    console.log('📊 Final Search Service Metrics:', this.metrics);
  }

  private async hydrateSearchCacheFromDb() {
    const cached = await this.transliterationCacheModel
      .find()
      .sort({ hitCount: -1 })
      .limit(500)
      .select('text variants')
      .lean()
      .exec();

    for (const item of cached) {
      const key = item.text.toLowerCase().trim();
      const variants = Array.from(new Set([item.text, ...item.variants]));
      this.searchVariantsCache.set(key, variants);
    }

    console.log(`✅ Search cache hydrated with ${cached.length} entries`);
  }

  private initializeDataLoaders() {
    this.doctorLoader = new DataLoader(async (ids: readonly string[]) => {
      const doctors = await this.doctorModel
        .find({ _id: { $in: [...ids] } })
        .select(
          'firstName middleName lastName address city subcity  yearsOfExperience role workingHours rating',
        )
        .lean()
        .exec();

      const map = new Map(doctors.map((d) => [d._id.toString(), d]));
      return ids.map((id) => map.get(id) ?? null);
    });

    this.hospitalLoader = new DataLoader(async (ids: readonly string[]) => {
      const hospitals = await this.hospitalModel
        .find({ _id: { $in: [...ids] } })
        .select('name address category status city rating workingHours')
        .lean()
        .exec();

      const map = new Map(hospitals.map((h) => [h._id.toString(), h]));
      return ids.map((id) => map.get(id) ?? null);
    });

    this.centerLoader = new DataLoader(async (ids: readonly string[]) => {
      const centers = await this.centerModel
        .find({ _id: { $in: [...ids] } })
        .select('name address category city rating workingHours')
        .lean()
        .exec();

      const map = new Map(centers.map((c) => [c._id.toString(), c]));
      return ids.map((id) => map.get(id) ?? null);
    });
  }

  // ============================================
  // Background Cache Warmup
  // ============================================

  private startBackgroundWarmup() {
    setTimeout(async () => {
      try {
        console.log('🔥 Starting background cache warmup...');

        const commonTerms = await this.getCommonSearchTerms();

        for (const term of commonTerms) {
          this.eventEmitter.emit('search.enhance', {
            searchTerm: term,
            timestamp: Date.now(),
          });

          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        console.log(
          `✅ Cache warmup initiated for ${commonTerms.length} terms`,
        );
      } catch (error) {
        console.warn('⚠️ Cache warmup failed:', error.message);
      }
    }, 5000);
  }

  private startMetricsReporting() {
    setInterval(() => {
      const cacheSize = this.searchVariantsCache.size;
      const hitRate =
        this.metrics.fastPathHits /
        (this.metrics.fastPathHits + this.metrics.slowPathHits || 1);

      console.log('📊 Search Service Metrics:', {
        cacheSize,
        cacheHitRate: `${(hitRate * 100).toFixed(2)}%`,
        fastPathHits: this.metrics.fastPathHits,
        slowPathHits: this.metrics.slowPathHits,
        aiEnhancements: this.metrics.aiEnhancements,
      });
    }, 60000);
  }
  private async getCommonSearchTerms(): Promise<string[]> {
    try {
      const cached = await this.transliterationCacheModel
        .find()
        .sort({ hitCount: -1 })
        .limit(100)
        .select('text')
        .lean()
        .exec();

      return cached.map((c) => c.text);
    } catch {
      return [
        'قلب',
        'عيون',
        'اسنان',
        'اطفال',
        'جلدية',
        'عظام',
        'cardiology',
        'dentist',
        'pediatric',
        'dermatology',
        'orthopedic',
      ];
    }
  }

  private triggerBackgroundEnhancement(searchTerm: string) {
    const cacheKey = searchTerm.toLowerCase().trim();

    if (this.searchVariantsCache.has(cacheKey)) {
      this.metrics.cacheHits++;
      return;
    }

    this.eventEmitter.emit('search.enhance', {
      searchTerm,
      timestamp: Date.now(),
    });
  }

  @OnEvent('search.enhance', { async: true })
  protected async handleSearchEnhancement(event: SearchEnhancementEvent) {
    const searchTerm = event.searchTerm.trim();
    const cacheKey = searchTerm.toLowerCase();

    if (/[\u0600-\u06FF]/.test(searchTerm)) {
      return;
    }

    try {
      const aiVariants = await this.aiService.transliterate(
        searchTerm,
        'en',
        'ar',
      );

      const finalVariants = Array.from(
        new Set([
          searchTerm,
          searchTerm.toLowerCase(),
          ...aiVariants,
          ...this.getBasicVariants(searchTerm),
        ]),
      )
        .filter((v) => v && v.length >= 2)
        .slice(0, 7);

      this.searchVariantsCache.set(cacheKey, finalVariants);
      this.metrics.aiEnhancements++;

      console.log(`✅ Cached ${finalVariants.length} EN→AR variants`);
    } catch (error) {
      const err = error as Error;
      console.warn(`⚠️ AI failed for "${searchTerm}"`, err.message);

      const fallback = this.getBasicVariants(searchTerm).slice(0, 5);
      this.searchVariantsCache.set(cacheKey, fallback, { ttl: 5 * 60 * 1000 });
    }
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////

  /**
   * Main entry point - NEVER blocks on AI
   */
  async filterEntitiesOptimized(query: SearchFilterDto) {
    const startTime = Date.now();
    const { condition = ConditionEnum.ALL, search } = query;

    if (search?.trim()) {
      this.triggerBackgroundEnhancement(search.trim());
    }

    let result;

    switch (condition) {
      case ConditionEnum.ALL:
        result = await this.handleAllCondition(query);
        break;
      case ConditionEnum.DOCTORS:
        result = await this.handleDoctorsCondition(query);
        break;
      case ConditionEnum.HOSPITAL:
        result = await this.handleHospitalCondition(query);
        break;
      case ConditionEnum.CENTER:
        result = await this.handleCentersCondition(query);
        break;

      default:
        throw new Error('Invalid condition parameter');
    }

    const duration = Date.now() - startTime;
    console.log(
      `⚡ Search completed in ${duration}ms (search: "${search || 'none'}")`,
    );

    return result;
  }

  private async queryDoctorsWithFilters(params: any) {
    const variants = params.search?.trim()
      ? this.getSearchVariantsNonBlocking(params.search.trim())
      : [];

    const conditions: any[] = [];

    if (variants.length > 0) {
      const fields = ['firstName', 'middleName', 'lastName', 'city', 'subcity'];
      conditions.push({
        $or: variants.flatMap((variant) =>
          fields.map((field) => ({
            [field]: { $regex: variant, $options: 'i' },
          })),
        ),
      });
    }

    conditions.push(...(await this.buildStaticConditions(params)));

    const query = conditions.length > 0 ? { $and: conditions } : {};

    const [doctors, total] = await Promise.all([
      this.doctorModel
        .find(query)
        .select(
          'firstName lastName address city subcity yearsOfExperience hospitals  workingHours rating',
        )
        .populate('publicSpecializationId', 'name')
        .populate('privateSpecializationId', 'name publicSpecialization')
        .populate('hospitals', 'id name')
        .limit(params.limit)
        .skip(params.skip)
        .sort(
          params.sortBy
            ? { [params.sortBy]: params.order === 'asc' ? 1 : -1 }
            : { createdAt: -1 },
        )
        .lean()
        .exec(),
      this.doctorModel.countDocuments(query),
    ]);

    return {
      data: doctors,
      pagination: {
        page: Math.floor(params.skip / params.limit) + 1,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  private getEmptyPaginatedResult(page: number, limit: number) {
    return {
      data: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    };
  }

  //Start Search Variants / Text Normalization
  private getSearchVariantsNonBlocking(searchTerm: string): string[] {
    const cacheKey = searchTerm.toLowerCase().trim();

    const cached = this.searchVariantsCache.get(cacheKey);
    if (cached) {
      this.metrics.fastPathHits++;
      return cached;
    }

    this.metrics.slowPathHits++;

    const basic = this.getBasicVariants(searchTerm).slice(0, 5);

    this.searchVariantsCache.set(cacheKey, basic, {
      ttl: 2 * 60 * 1000,
    });

    return basic;
  }

  private async buildStaticConditions(params: SearchFilterDto): Promise<any[]> {
    const conditions: any[] = [];

    // ======== City / Subcity ========
    if (params.city) conditions.push({ city: params.city });
    if (params.subcity) conditions.push({ subcity: params.subcity });

    // ======== General Specialty ========
    if (params.generalSpecialtyNames?.length) {
      const publicSpecs = await this.publicSpecializationModel.find(
        { name: { $in: params.generalSpecialtyNames } },
        { _id: 1 },
      );
      const publicSpecIds = publicSpecs.map((s) => s._id);
      if (publicSpecIds.length)
        conditions.push({ publicSpecializationId: { $in: publicSpecIds } });
    }

    // ======== Private Specialty ========
    if (params.privateSpecializationNames?.length) {
      const privateSpecs = await this.privateSpecializationModel.find(
        { name: { $in: params.privateSpecializationNames } },
        { _id: 1 },
      );
      const privateSpecIds = privateSpecs.map((s) => s._id);
      if (privateSpecIds.length)
        conditions.push({ privateSpecializationId: { $in: privateSpecIds } });
    }

    // ======== Gender ========
    if (params.gender) conditions.push({ gender: params.gender });

    // ======== Experience ========
    if (params.minExperience !== undefined)
      conditions.push({ yearsOfExperience: { $gte: params.minExperience } });

    // ======== Rating ========
    if (params.minRating !== undefined)
      conditions.push({ rating: { $gte: params.minRating } });

    // ======== Price ========
    if (
      params.inspectionPriceMin !== undefined ||
      params.inspectionPriceMax !== undefined
    ) {
      const priceFilter: any = {};
      if (params.inspectionPriceMin !== undefined)
        priceFilter.$gte = params.inspectionPriceMin;
      if (params.inspectionPriceMax !== undefined)
        priceFilter.$lte = params.inspectionPriceMax;
      conditions.push({ inspectionPrice: priceFilter });
    }

    return conditions;
  }

  private getBasicVariants(text: string): string[] {
    const variants = new Set<string>();
    const clean = text.trim();

    variants.add(clean);
    variants.add(clean.toLowerCase());

    if (/[\u0600-\u06FF]/.test(clean)) {
      const normalized = this.normalizeArabic(clean);
      variants.add(normalized);
      variants.add(normalized.replace(/\s+/g, ' '));
    } else {
      const base = clean.toLowerCase();

      variants.add(base.replace(/(.)\1+/g, '$1'));
      variants.add(base.replace(/ph/g, 'f'));
      variants.add(base.replace(/ck/g, 'k'));
      variants.add(base.replace(/sh/g, 'ch'));

      this.getEssentialPhoneticVariants(base).forEach((v) => variants.add(v));
    }

    return Array.from(variants)
      .filter((v) => v.length >= 2)
      .slice(0, 7);
  }

  private getEssentialPhoneticVariants(text: string): string[] {
    const variants = new Set<string>([text.toLowerCase()]);
    const base = text.toLowerCase();

    const commonPatterns = [
      { from: /a/g, to: 'e' },
      { from: /e/g, to: 'a' },
      { from: /een$/g, to: 'ain' },
      { from: /ain$/g, to: 'een' },
      { from: /(.)\1/g, to: '$1' },
    ];

    commonPatterns.forEach(({ from, to }) => {
      if (from.test(base)) {
        const variant = base.replace(from, to);
        if (variant !== base && variant.length >= 2) {
          variants.add(variant);
        }
      }
    });

    return Array.from(variants).slice(0, 5);
  }

  private normalizeArabic(text: string): string {
    return text
      .replace(/[\u064B-\u065F]/g, '')
      .replace(/\s+/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/[ى]/g, 'ي')
      .replace(/[ة]/g, 'ه')
      .replace(/[ؤ]/g, 'و')
      .replace(/[ئ]/g, 'ي')
      .trim();
  }

  //End Search

  // ---------------------------------------------
  // QUERY DOCTORS
  // ---------------------------------------------
  public async queryDoctorsOptimized(
    search?: string,
    skip = 0,
    limit = 10,
    sortBy?: string,
    order: 'asc' | 'desc' = 'desc',
    filters?: {
      generalSpecialtyNames?: string[];
      privateSpecializationNames?: string[];
      yearsOfExperience?: number;
      hospitalNames?: string[];
      city?: City;
      subcity?: string;
      gender?: string;
      minRating?: number;
    },
  ) {
    const conditions: any[] = [];

    // --- Search term ---
    if (search?.trim()) {
      const variants = this.getSearchVariantsNonBlocking(search.trim()) || [];
      this.addSearchConditions(variants, conditions);
    }

    // --- Filters ---
    if (filters) await this.addFilterConditions(filters, conditions);

    const query = conditions.length ? { $and: conditions } : {};

    const [doctors, total] = await Promise.all([
      this.doctorModel
        .find(query)
        .select(
          'firstName lastName middleName address yearsOfExperience hospitals workingHours rating city subcity publicSpecialization privateSpecialization',
        )
        .populate('hospitals', 'id name')
        .limit(limit)
        .skip(skip)
        .sort(
          sortBy ? { [sortBy]: order === 'asc' ? 1 : -1 } : { createdAt: -1 },
        )
        .lean()
        .exec(),

      this.doctorModel.countDocuments(query),
    ]);

    return {
      data: doctors,
      pagination: {
        page: Math.floor(skip / limit) + 1,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // --- Helper: add search conditions (synchronous) ---
  private addSearchConditions(variants: string[], conditions: any[]) {
    const fields = [
      'firstName',
      'middleName',
      'lastName',
      'address',
      'city',
      'subcity',
    ];
    const arrayFields = ['centers', 'hospitals'];

    const orConditions = [
      ...variants.flatMap((v) =>
        fields.map((f) => ({ [f]: { $regex: v, $options: 'i' } })),
      ),
      ...variants.flatMap((v) =>
        arrayFields.map((f) => ({
          [f]: { $elemMatch: { name: { $regex: v, $options: 'i' } } },
        })),
      ),
      ...variants.map((v) => ({
        'workingHours.location.entity_name': { $regex: v, $options: 'i' },
      })),
      ...variants.map((v) => ({
        'workingHours.location.address': { $regex: v, $options: 'i' },
      })),
    ];

    if (orConditions.length) {
      conditions.push({ $or: orConditions });
    }
  }

  // --- Helper: add filter conditions (asynchronous) ---
  // --- Helper: add filter conditions (asynchronous) ---
  private async addFilterConditions(
    filters: {
      generalSpecialtyNames?: string[];
      privateSpecializationNames?: string[];
      yearsOfExperience?: number;
      hospitalNames?: string[];
      city?: string;
      subcity?: string;
      gender?: string;
      minRating?: number;
    },
    conditions: any[],
  ) {
    // ===== General Specialty (Public) =====
    if (filters.generalSpecialtyNames?.length) {
      const publicSpecs = await this.publicSpecializationModel.find(
        { name: { $in: filters.generalSpecialtyNames } },
        { _id: 1 },
      );
      const publicSpecIds = publicSpecs.map((s) => s._id);
      if (publicSpecIds.length) {
        conditions.push({ publicSpecializationId: { $in: publicSpecIds } });
      }
    }

    // ===== Private Specialty =====
    if (filters.privateSpecializationNames?.length) {
      const privateSpecs = await this.privateSpecializationModel.find(
        { name: { $in: filters.privateSpecializationNames } },
        { _id: 1 },
      );
      const privateSpecIds = privateSpecs.map((s) => s._id);
      if (privateSpecIds.length) {
        conditions.push({ privateSpecializationId: { $in: privateSpecIds } });
      }
    }

    // ===== Years of Experience =====
    if (filters.yearsOfExperience !== undefined) {
      conditions.push({
        yearsOfExperience: { $gte: filters.yearsOfExperience },
      });
    }

    // ===== Hospitals =====
    if (filters.hospitalNames?.length) {
      conditions.push({
        'hospitals.name': { $in: filters.hospitalNames.map((n) => n.trim()) },
      });
    }

    // ===== City / Subcity =====
    if (filters.city) {
      conditions.push({ city: filters.city });
      if (filters.subcity) {
        conditions.push({ subcity: filters.subcity });
      }
    }

    // ===== Gender =====
    if (filters.gender) {
      conditions.push({ gender: filters.gender });
    }

    // ===== Minimum Rating =====
    if (filters.minRating !== undefined) {
      conditions.push({ rating: { $gte: filters.minRating } });
    }
  }

  // --- Helper: add subcity condition ---
  private addSubcityCondition(city: City, subcity: string, conditions: any[]) {
    const areas = this.getCityAreas(city);
    if (areas?.includes(subcity)) {
      conditions.push({ subcity });
    }
  }

  // --- Helper function to get city areas ---
  private getCityAreas(city: City): string[] | undefined {
    switch (city) {
      case City.Damascus:
        return Object.values(DamascusAreas);
      case City.Aleppo:
        return Object.values(AleppoAreas);
      case City.Homs:
        return Object.values(HomsAreas);
      case City.Idlib:
        return Object.values(IdlibAreas);
      case City.Latakia:
        return Object.values(LatakiaAreas);
      case City.Tartus:
        return Object.values(TartousAreas);
      case City.Raqqa:
        return Object.values(RaqqaAreas);
      case City.DeirEzzor:
        return Object.values(DeirEzzorAreas);
      case City.Hama:
        return Object.values(HamaAreas);
      case City.Quneitra:
        return Object.values(QuneitraAreas);
      case City.Suwayda:
        return Object.values(SweidaAreas);
      case City.AlHasakah:
        return Object.values(HassakehAreas);
      case City.Daraa:
        return Object.values(DaraaAreas);
      default:
        return undefined;
    }
  }

  // ---------------------------------------------
  // QUERY CENTERS
  // ---------------------------------------------
  private async queryCentersOptimized(
    search?: string,
    skip = 0,
    limit = 10,
    sortBy?: string,
    order: 'asc' | 'desc' = 'desc',
    filters?: { name?: string | string[]; category?: string; city?: string },
  ) {
    const conditions: any[] = [];

    // --- SEARCH ---
    if (search?.trim()) {
      const variants = this.getSearchVariantsNonBlocking(search.trim());
      if (variants.length) {
        conditions.push({
          $or: variants.map((v) => ({ name: { $regex: v, $options: 'i' } })),
        });
      }
    }

    // --- NAME FILTER ---
    if (filters?.name) {
      const names = Array.isArray(filters.name) ? filters.name : [filters.name];
      const cleanNames = names.map((n) => n.trim()).filter(Boolean);
      if (cleanNames.length) {
        conditions.push({
          $or: cleanNames.map((n) => ({ name: { $regex: n, $options: 'i' } })),
        });
      }
    }

    // --- CATEGORY & CITY FILTER ---
    if (filters?.category) conditions.push({ category: filters.category });
    if (filters?.city) conditions.push({ city: filters.city });

    // --- FINAL QUERY ---
    const mongoQuery = conditions.length ? { $and: conditions } : {};
    const sortQuery = sortBy
      ? { [sortBy]: order === 'asc' ? 1 : -1 }
      : { createdAt: -1 };

    const [centers, total] = await Promise.all([
      this.centerModel
        .find(mongoQuery)
        .select(
          'name address category city phones workingHours rating createdAt',
        )
        .limit(limit)
        .skip(skip)
        .lean()
        .exec(),
      this.centerModel.countDocuments(mongoQuery),
    ]);

    return {
      data: centers,
      pagination: {
        page: Math.floor(skip / limit) + 1,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ---------------------------------------------
  // QUERY HOSPITALS
  // ---------------------------------------------
  private async queryHospitalsOptimized(
    search?: string,
    skip = 0,
    limit = 10,
    sortBy?: string,
    order: 'asc' | 'desc' = 'desc',
    filters?: {
      name?: string | string[];
      category?: string;
      status?: string;
      city?: string;
      minBeds?: number;
      maxBeds?: number;
      departments?: string[];
      machines?: string[];
      operations?: string[];
    },
  ) {
    const conditions: any[] = [];

    // --- SEARCH ---
    if (search?.trim()) {
      const variants = this.getSearchVariantsNonBlocking(search.trim());
      if (variants.length) {
        conditions.push({
          $or: variants.flatMap((v) => [
            { name: { $regex: v, $options: 'i' } },
            { city: { $regex: v, $options: 'i' } },
            { address: { $regex: v, $options: 'i' } },
          ]),
        });
      }
    }

    // --- NAME FILTER ---
    if (filters?.name) {
      const names = Array.isArray(filters.name) ? filters.name : [filters.name];
      const cleanNames = names.map((n) => n.trim()).filter(Boolean);
      if (cleanNames.length) {
        conditions.push({
          $or: cleanNames.map((n) => ({ name: { $regex: n, $options: 'i' } })),
        });
      }
    }

    // --- CATEGORY / STATUS / CITY FILTER ---
    if (filters?.category) conditions.push({ category: filters.category });
    if (filters?.status) conditions.push({ hospitalstatus: filters.status });
    if (filters?.city) conditions.push({ city: filters.city });

    // --- BEDS FILTER ---
    if (filters?.minBeds !== undefined || filters?.maxBeds !== undefined) {
      const bedsQuery: any = {};
      if (filters.minBeds !== undefined) bedsQuery.$gte = filters.minBeds;
      if (filters.maxBeds !== undefined) bedsQuery.$lte = filters.maxBeds;
      conditions.push({ NumberOfBeds: bedsQuery });
    }

    // --- DEPARTMENTS / MACHINES / OPERATIONS FILTER ---
    if (
      filters?.departments?.length ||
      filters?.machines?.length ||
      filters?.operations?.length
    ) {
      const deptConditions: any[] = [];

      if (filters.departments?.length)
        deptConditions.push({ type: { $in: filters.departments } });

      if (filters.machines?.length) {
        deptConditions.push({
          $or: [
            { machines_type: { $in: filters.machines } },
            { 'machines.name': { $in: filters.machines } },
          ],
        });
      }

      if (filters.operations?.length)
        deptConditions.push({ 'operations.name': { $in: filters.operations } });

      const hospitalIds = await this.commonDepartmentModel
        .find({ $and: deptConditions })
        .distinct('hospitalId');

      if (!hospitalIds.length) {
        return {
          data: [],
          pagination: {
            page: Math.floor(skip / limit) + 1,
            limit,
            total: 0,
            totalPages: 0,
          },
        };
      }

      conditions.push({ _id: { $in: hospitalIds } });
    }

    // --- FINAL QUERY ---
    const mongoQuery = conditions.length ? { $and: conditions } : {};
    const sortQuery = sortBy
      ? { [sortBy]: order === 'asc' ? 1 : -1 }
      : { createdAt: -1 };

    const [hospitals, total] = await Promise.all([
      this.hospitalModel
        .find(mongoQuery)
        .select(
          'name address category hospitalstatus city NumberOfBeds phones workingHours rating createdAt',
        )
        .limit(limit)
        .skip(skip)
        .lean()
        .exec(),
      this.hospitalModel.countDocuments(mongoQuery),
    ]);

    return {
      data: hospitals,
      pagination: {
        page: Math.floor(skip / limit) + 1,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ============================================
  // Condition Handlers
  // ============================================

  private async handleAllCondition(query: SearchFilterDto) {
    const { search, page = 1, limit = 10, sortBy, order = 'desc' } = query;
    const skip = (page - 1) * limit;

    const [doctorsResult, hospitalsResult, centersResult] = await Promise.all([
      this.queryDoctorsOptimized(search, skip, limit, sortBy, order),
      this.queryHospitalsOptimized(search, skip, limit, sortBy, order, {
        name: query.hospitalName,
        category: query.hospitalCategory,
        status: query.hospitalStatus,
        city: query.hospitalCity,
        departments: query.departments,
        machines: query.machines,
        operations: query.operations,
      }),
      this.queryCentersOptimized(search, skip, limit, sortBy, order, {
        name: query.centerName,
        category: query.centerSpecialization,
        city: query.centerCity,
      }),
    ]);

    return {
      doctors: doctorsResult ?? {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      },
      hospitals: hospitalsResult ?? {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      },
      centers: centersResult ?? {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      },
    };
  }

  private async handleDoctorsCondition(query: SearchFilterDto) {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const doctorsResult = await this.queryDoctorsWithFilters({
      search: query.search,
      role: query.condition,
      generalSpecialtyNames: query.generalSpecialtyNames,
      privateSpecializationNames: query.privateSpecializationNames,
      yearsOfExperience: query.minExperience,
      hospitalNames: query.hospitalName,
      city: query.city,
      gender: query.gender,
      minRating: query.minRating,
      skip,
      limit,
      sortBy: query.sortBy,
      order: query.order || 'desc',
    });

    return {
      doctors: doctorsResult,
      hospitals: this.getEmptyPaginatedResult(page, limit),
      centers: this.getEmptyPaginatedResult(page, limit),
    };
  }

  private async handleHospitalCondition(query: SearchFilterDto) {
    const { page = 1, limit = 10, search, sortBy, order = 'desc' } = query;
    const skip = (page - 1) * limit;

    // بناء شروط الفلترة
    const conditions: any[] = [];

    // البحث العام
    if (search?.trim()) {
      const variants = this.getSearchVariantsNonBlocking(search.trim());
      const fields = ['name', 'city', 'subcity', 'address', 'phones'];
      conditions.push({
        $or: variants.flatMap((v) =>
          fields.map((f) => ({ [f]: { $regex: v, $options: 'i' } })),
        ),
      });
    }

    // الفلاتر الأساسية
    if (query.hospitalName) conditions.push({ name: query.hospitalName });
    if (query.hospitalCategory)
      conditions.push({ category: query.hospitalCategory });
    if (query.hospitalStatus) conditions.push({ status: query.hospitalStatus });
    if (query.hospitalCity) conditions.push({ city: query.hospitalCity });
    if (query.subcity) conditions.push({ subcity: query.subcity });

    // فلترة عبر CommonDepartment
    const departmentConditions: any[] = [];
    if (query.departments?.length)
      departmentConditions.push({ type: { $in: query.departments } });

    if (query.machines?.length)
      departmentConditions.push({
        $or: [
          { machines_type: { $in: query.machines } },
          { 'machines.name': { $in: query.machines } },
        ],
      });

    if (query.operations?.length)
      departmentConditions.push({
        'operations.name': { $in: query.operations },
      });

    if (
      query.hospitalMinBeds !== undefined ||
      query.hospitalMaxBeds !== undefined
    ) {
      const bedsFilter: any = {};
      if (query.hospitalMinBeds !== undefined)
        bedsFilter.$gte = query.hospitalMinBeds;
      if (query.hospitalMaxBeds !== undefined)
        bedsFilter.$lte = query.hospitalMaxBeds;
      departmentConditions.push({ numberOfBeds: bedsFilter });
    }

    // إذا توجد شروط للأقسام / الأجهزة / العمليات، نجلب الـ hospitalId من CommonDepartment
    if (departmentConditions.length) {
      const deptHospitalIds = await this.commonDepartmentModel
        .find({ $and: departmentConditions })
        .distinct('hospitalId');
      if (deptHospitalIds.length)
        conditions.push({ _id: { $in: deptHospitalIds } });
      else return this.getEmptyPaginatedResult(page, limit); // لا يوجد مستشفيات
    }

    // استعلام المستشفيات النهائي
    const [hospitals, total] = await Promise.all([
      this.hospitalModel
        .find({ $and: conditions })
        .limit(limit)
        .skip(skip)
        .sort(
          sortBy ? { [sortBy]: order === 'asc' ? 1 : -1 } : { createdAt: -1 },
        )
        .lean()
        .exec(),
      this.hospitalModel.countDocuments({ $and: conditions }),
    ]);

    return {
      data: hospitals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async handleCentersCondition(query: SearchFilterDto) {
    const { page = 1, limit = 10, search, sortBy, order = 'desc' } = query;
    const skip = (page - 1) * limit;

    const conditions: any[] = [];

    // البحث العام
    if (search?.trim()) {
      const variants = this.getSearchVariantsNonBlocking(search.trim());
      const fields = ['name', 'city', 'subcity', 'address'];
      conditions.push({
        $or: variants.flatMap((v) =>
          fields.map((f) => ({ [f]: { $regex: v, $options: 'i' } })),
        ),
      });
    }

    // الفلاتر الأساسية
    if (query.centerName) conditions.push({ name: query.centerName });
    if (query.centerSpecialization)
      conditions.push({ category: query.centerSpecialization });
    if (query.centerCity) conditions.push({ city: query.centerCity });
    if (query.subcity) conditions.push({ subcity: query.subcity });

    // فلترة عبر CommonDepartment
    const departmentConditions: any[] = [];
    if (query.departments?.length)
      departmentConditions.push({ type: { $in: query.departments } });

    if (query.machines?.length)
      departmentConditions.push({
        $or: [
          { machines_type: { $in: query.machines } },
          { 'machines.name': { $in: query.machines } },
        ],
      });

    if (query.operations?.length)
      departmentConditions.push({
        'operations.name': { $in: query.operations },
      });

    if (
      query.hospitalMinBeds !== undefined ||
      query.hospitalMaxBeds !== undefined
    ) {
      const bedsFilter: any = {};
      if (query.hospitalMinBeds !== undefined)
        bedsFilter.$gte = query.hospitalMinBeds;
      if (query.hospitalMaxBeds !== undefined)
        bedsFilter.$lte = query.hospitalMaxBeds;
      departmentConditions.push({ numberOfBeds: bedsFilter });
    }

    // إذا توجد شروط للأقسام / الأجهزة / العمليات، نجلب الـ centerId من CommonDepartment
    if (departmentConditions.length) {
      const deptCenterIds = await this.commonDepartmentModel
        .find({ $and: departmentConditions })
        .distinct('centerId');
      if (deptCenterIds.length)
        conditions.push({ _id: { $in: deptCenterIds } });
      else return this.getEmptyPaginatedResult(page, limit); // لا يوجد مراكز
    }

    // استعلام المراكز النهائي
    const [centers, total] = await Promise.all([
      this.centerModel
        .find({ $and: conditions })
        .limit(limit)
        .skip(skip)
        .sort(
          sortBy ? { [sortBy]: order === 'asc' ? 1 : -1 } : { createdAt: -1 },
        )
        .lean()
        .exec(),
      this.centerModel.countDocuments({ $and: conditions }),
    ]);

    return {
      data: centers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Public methods
  async getDoctorById(id: string) {
    return this.doctorLoader.load(id);
  }

  async getHospitalById(id: string) {
    return this.hospitalLoader.load(id);
  }

  async getCenterById(id: string) {
    return this.centerLoader.load(id);
  }

  clearCache() {
    this.searchVariantsCache.clear();
    this.doctorLoader.clearAll();
    this.hospitalLoader.clearAll();
    this.centerLoader.clearAll();
    console.log('✅ All caches cleared');
  }
}
