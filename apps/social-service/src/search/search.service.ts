import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SearchFilterDto } from './dto/search-filter.dto';
import { TranslationAiService } from '../translation-ai/translation-ai.service';
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
  ) { }

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

    // --- City filter ---
    if (params.city) {
      const cityInput = params.city.trim().toLowerCase();
      const cityValue = Object.values(City).find(
        (c) => c.toLowerCase() === cityInput,
      );
      if (!cityValue) throw new Error(`Invalid city value: ${params.city}`);
      conditions.push({ city: cityValue });

      // Subcity strict
      if (params.subcity) {
        const subcityEnum = this.getSubcityEnum(params.city);
        if (subcityEnum && subcityEnum.includes(params.subcity)) {
          conditions.push({ subcity: params.subcity });
        }
      }
    }

    // --- Public specialization ---
    if (
      params.publicSpecializationId &&
      Types.ObjectId.isValid(params.publicSpecializationId)
    ) {
      conditions.push({
        publicSpecializationId: new Types.ObjectId(
          params.publicSpecializationId,
        ),
      });
    }

    // --- Private specialization ---
    if (
      Array.isArray(params.privateSpecializationIds) &&
      params.privateSpecializationIds.length > 0
    ) {
      const ids = params.privateSpecializationIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));

      if (ids.length) {
        conditions.push({
          privateSpecializationId: {
            $in: ids,
          },
        });
      }
    }

    // --- Other strict filters ---
    if (params.gender) conditions.push({ gender: params.gender });
    if (params.hospitalStatus)
      conditions.push({ status: params.hospitalStatus });
    if (params.minRating !== undefined)
      conditions.push({ rating: { $gte: params.minRating } });
    if (params.minExperience !== undefined)
      conditions.push({ yearsOfExperience: { $gte: params.minExperience } });




    if (params.inspectionDuration !== undefined) {
      conditions.push({
        inspectionDuration: { $gte: params.inspectionDuration },
      });
    }

    // =============================
    // Search count / popularity filter
    // =============================
    if (params.searchCount !== undefined) {
      conditions.push({ searchCount: { $gte: params.searchCount } });
    }

    // =============================
    // Latitude / Longitude filter
    // =============================
    if (params.latitude !== undefined) {
      conditions.push({ latitude: params.latitude });
    }

    if (params.longitude !== undefined) {
      conditions.push({ longitude: params.longitude });
    }

    if (params.hospitalName) {
      conditions.push({
        hospitals: {
          $elemMatch: { name: { $regex: params.hospitalName, $options: 'i' } },
        },
      });
    }

    // --- Name search ---
    if (params.search?.trim().length) {
      const searchStr = params.search.trim();
      const variants = this.getSearchVariantsNonBlocking(searchStr) || [];
      if (variants.length) {
        const fields = ['firstName', 'lastName', 'middleName'];
        const orConditions = variants.flatMap((v) =>
          fields.map((f) => ({ [f]: { $regex: v, $options: 'i' } })),
        );
        if (orConditions.length) conditions.push({ $or: orConditions });
      }
    }

    return conditions;
  }

  private getSubcityEnum(city: City): string[] | null {
    switch (city) {
      case City.Damascus:
        return Object.values(DamascusAreas);
      case City.Aleppo:
        return Object.values(AleppoAreas);
      case City.Homs:
        return Object.values(HomsAreas);
      case City.Hama:
        return Object.values(HamaAreas);
      case City.Latakia:
        return Object.values(LatakiaAreas);
      case City.Tartus:
        return Object.values(TartousAreas);
      case City.Idlib:
        return Object.values(IdlibAreas);
      case City.Raqqa:
        return Object.values(RaqqaAreas);
      case City.DeirEzzor:
        return Object.values(DeirEzzorAreas);
      case City.Suwayda:
        return Object.values(SweidaAreas);
      case City.AlHasakah:
        return Object.values(HassakehAreas);
      case City.Daraa:
        return Object.values(DaraaAreas);
      case City.Quneitra:
        return Object.values(QuneitraAreas);
      default:
        return null;
    }
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
      generalSpecialtyName?: string;
      privateSpecializationNames?: string[];
      yearsOfExperience?: number;
      hospitalNames?: string[];
      city?: City;
      subcity?: string;
    },
  ) {
    const conditions: any[] = [];

    // --- Handle search term safely ---
    if (search?.trim().length) {
      const variants = this.getSearchVariantsNonBlocking(search.trim()) || [];
      if (variants.length) this.addSearchConditions(variants, conditions);
    }

    // --- Handle filters safely ---
    if (filters) await this.addFilterConditions(filters, conditions);

    const query = conditions.length ? { $and: conditions } : {};

    const [doctors, total] = await Promise.all([
      this.doctorModel
        .find(query)
        .select(
          'firstName lastName middleName address yearsOfExperience hospitals workingHours rating city subcity publicSpecializationId privateSpecializationId',
        )
        .populate('publicSpecializationId', 'name')
        .populate('privateSpecializationId', 'name publicSpecialization')
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
  private async addFilterConditions(
    filters: {
      publicSpecializationId?: string;
      privateSpecializationIds?: string[];
      yearsOfExperience?: number;
      hospitalNames?: string[];
      city?: string;
      subcity?: string;
      gender?: string;
      minRating?: number;
      inspectionPriceMin?: number;
      inspectionPriceMax?: number;
    },
    conditions: any[],
  ) {
    /* =============================
     General Specialty Filter
  ============================== */

    if (
      filters.publicSpecializationId &&
      Types.ObjectId.isValid(filters.publicSpecializationId)
    ) {
      conditions.push({
        publicSpecializationId: new Types.ObjectId(
          filters.publicSpecializationId,
        ),
      });
    }

    /* =============================
     Private Specialty Filter
  ============================== */

    if (
      Array.isArray(filters.privateSpecializationIds) &&
      filters.privateSpecializationIds.length > 0
    ) {
      const validIds = filters.privateSpecializationIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));

      if (validIds.length) {
        conditions.push({
          privateSpecializationId: {
            $in: validIds,
          },
        });
      }
    }

    /* =============================
     Experience Filter
  ============================== */

    if (filters.yearsOfExperience !== undefined) {
      conditions.push({
        yearsOfExperience: {
          $gte: filters.yearsOfExperience,
        },
      });
    }

    /* =============================
     Hospital Filter
  ============================== */

    if (Array.isArray(filters.hospitalNames) && filters.hospitalNames.length) {
      conditions.push({
        'hospitals.name': {
          $in: filters.hospitalNames,
        },
      });
    }

    /* =============================
     City Filter
  ============================== */

    if (filters.city) {
      conditions.push({
        city: filters.city,
      });
    }

    /* =============================
     Subcity Filter
  ============================== */

    // --- Subcity filter ---
    if (filters.subcity) {
      const cityValue: City | undefined = Object.values(City).find(
        (c) => c === filters.city,
      );

      if (cityValue) {
        const subcityList = this.getSubcityEnum(cityValue);
        if (subcityList?.includes(filters.subcity)) {
          conditions.push({ subcity: filters.subcity });
        }
      }
    }

    /* =============================
     Gender Filter
  ============================== */

    if (filters.gender) {
      conditions.push({
        gender: filters.gender,
      });
    }

    /* =============================
     Rating Filter
  ============================== */

    if (filters.minRating !== undefined) {
      conditions.push({
        rating: {
          $gte: filters.minRating,
        },
      });
    }

    // =============================
    // Inspection Price filter
    // =============================
    const { inspectionPriceMin, inspectionPriceMax } = filters;

    if (inspectionPriceMin !== undefined || inspectionPriceMax !== undefined) {
      const price: any = {};

      if (inspectionPriceMin !== undefined)
        price.$gte = Number(inspectionPriceMin);

      if (inspectionPriceMax !== undefined)
        price.$lte = Number(inspectionPriceMax);
      console.log(typeof inspectionPriceMin, typeof inspectionPriceMax);

      conditions.push({ inspectionPrice: price });
    }

  }

  // --- Helper: add subcity condition ---
  private addSubcityCondition(city: City, subcity: string, conditions: any[]) {
    const areas = this.getSubcityEnum(city);
    if (areas?.includes(subcity)) {
      conditions.push({ subcity });
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

    // --- Handle search term ---
    if (search?.trim()) {
      const variants = this.getSearchVariantsNonBlocking(search.trim());
      console.log('Center variants:', variants);
      if (variants.length) {
        conditions.push({
          $or: variants.map((v) => ({ name: { $regex: v, $options: 'i' } })),
        });
      }
    }

    // --- Handle filters safely ---
    const namesToSearch: string[] = [];
    if (filters?.name) {
      if (Array.isArray(filters.name))
        namesToSearch.push(...filters.name.filter(Boolean));
      else if (typeof filters.name === 'string')
        namesToSearch.push(filters.name.trim());
    }
    if (namesToSearch.length) {
      conditions.push({
        $or: namesToSearch.map((n) => ({ name: { $regex: n, $options: 'i' } })),
      });
    }

    if (filters?.category) conditions.push({ category: filters.category });
    if (filters?.city) conditions.push({ city: filters.city });

    const query = conditions.length ? { $and: conditions } : {};

    const [centers, total] = await Promise.all([
      this.centerModel
        .find(query)
        .select('name address category city phones workingHours rating')
        .limit(limit)
        .skip(skip)
        .sort(
          sortBy ? { [sortBy]: order === 'asc' ? 1 : -1 } : { createdAt: -1 },
        )
        .lean()
        .exec(),
      this.centerModel.countDocuments(query),
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
      hospitalStatus?: string;
      approvalStatus?: string;
      city?: string;
      minBeds?: number;
      maxBeds?: number;
    },
  ) {
    const conditions: any[] = [];

    // --- Handle search term ---
    if (search?.trim()) {
      const variants = this.getSearchVariantsNonBlocking(search.trim());
      if (variants.length) {
        conditions.push({
          $or: variants.map((v) => ({ name: { $regex: v, $options: 'i' } })),
        });
      }
    }

    // --- Handle filters safely ---
    const namesToSearch: string[] = [];
    if (filters?.name) {
      if (Array.isArray(filters.name))
        namesToSearch.push(...filters.name.filter(Boolean));
      else if (typeof filters.name === 'string')
        namesToSearch.push(filters.name.trim());
    }
    if (namesToSearch.length) {
      conditions.push({
        $or: namesToSearch.map((n) => ({ name: { $regex: n, $options: 'i' } })),
      });
    }

    if (filters?.category) conditions.push({ category: filters.category });
    if (filters?.hospitalStatus) {
      conditions.push({ hospitalstatus: filters.hospitalStatus });
    }

    if (filters?.approvalStatus) {
      conditions.push({ status: filters.approvalStatus });
    }

    if (filters?.city) conditions.push({ city: filters.city });

    if (filters?.minBeds !== undefined || filters?.maxBeds !== undefined) {
      const beds: any = {};
      if (filters.minBeds !== undefined) beds.$gte = filters.minBeds;
      if (filters.maxBeds !== undefined) beds.$lte = filters.maxBeds;
      conditions.push({ NumberOfBeds: beds });
    }

    const query = conditions.length ? { $and: conditions } : {};

    const [hospitals, total] = await Promise.all([
      this.hospitalModel
        .find(query)
        .select(
          'name address category status city NumberOfBeds phones workingHours rating',
        )
        .limit(limit)
        .skip(skip)
        .sort(
          sortBy ? { [sortBy]: order === 'asc' ? 1 : -1 } : { createdAt: -1 },
        )
        .lean()
        .exec(),
      this.hospitalModel.countDocuments(query),
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
        hospitalStatus: query.hospitalStatus,
        city: query.hospitalCity,
      }),
      this.queryCentersOptimized(search, skip, limit, sortBy, order, {
        name: query.centerName,
        category: query.centerSpecialization,
        city: query.centerCity,
      }),
    ]);

    return {
      doctors: doctorsResult,
      hospitals: hospitalsResult,
      centers: centersResult,
    };
  }

  private async handleDoctorsCondition(query: SearchFilterDto) {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const doctorsResult = await this.queryDoctorsWithFilters({
      search: query.search,
      role: query.condition,
      publicSpecializationId: query.publicSpecializationId,
      privateSpecializationIds: query.privateSpecializationIds,
      yearsOfExperience: query.minExperience,
      hospitalNames: query.hospitalName,
      city: query.city,
      subcity: query.subcity,
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

    const hospitalsResult = await this.queryHospitalsOptimized(
      search,
      skip,
      limit,
      sortBy,
      order,
      {
        name: query.hospitalName,
        category: query.hospitalCategory,
        hospitalStatus: query.hospitalStatus,
        city: query.hospitalCity,
      },
    );

    return {
      doctors: this.getEmptyPaginatedResult(page, limit),
      hospitals: hospitalsResult,
      centers: this.getEmptyPaginatedResult(page, limit),
    };
  }

  private async handleCentersCondition(query: SearchFilterDto) {
    const { page = 1, limit = 10, search, sortBy, order = 'desc' } = query;
    const skip = (page - 1) * limit;

    const centersResult = await this.queryCentersOptimized(
      search,
      skip,
      limit,
      sortBy,
      order,
      {
        name: query.centerName,
        category: query.centerSpecialization,
        city: query.centerCity,
      },
    );

    return {
      doctors: this.getEmptyPaginatedResult(page, limit),
      hospitals: this.getEmptyPaginatedResult(page, limit),
      centers: centersResult,
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
