export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
}

export enum UserRole {
  USER = 'user',
  HOSPITAL = 'hospital',
  DOCTOR = 'doctor',
  CENTER = 'center',
  ADMIN = 'admin',
  SYSTEM = 'system',
}

export enum City {
  DAMASCUS = 'DAMASCUS',
  ALEPPO = 'ALEPPO',
  DAMASCUS_COUNTRYSIDE = 'DAMASCUS_COUNTRYSIDE',
  HAMA = 'HAMA',
  IDLIB = 'IDLIB',
  DEIR_EZ_ZOR = 'DEIR_EZ_ZOR',
  RAQQA = 'RAQQA',
  ALSUWIDA = 'ALSUWIDA',
  HOMS = 'HOMS',
  DARAA = 'DARAA',
  TARTUS = 'TARTUS',
  LATA = 'LATA',
  LATTAKIA = 'LATTAKIA',
  ALHASAKA = 'ALHASAKA',
}
export enum SubCity {
  DAMASCUS_CITY = 'DAMASCUS_CITY',
  DAMASCUS_SUBURB = 'DAMASCUS_SUBURB',
  ALEPPO_CITY = 'ALEPPO_CITY',
  ALEPPO_SUBURB = 'ALEPPO_SUBURB',
  DAMASCUS_COUNTRYSIDE_CITY = 'DAMASCUS_COUNTRYSIDE_CITY',
  DAMASCUS_COUNTRYSIDE_SUBURB = 'DAMASCUS_COUNTRYSIDE_SUBURB',
  HAMA_CITY = 'HAMA_CITY',
  HAMA_SUBURB = 'HAMA_SUBURB',
  IDLIB_CITY = 'IDLIB_CITY',
  IDLIB_SUBURB = 'IDLIB_SUBURB',
  DEIR_EZ_ZOR_CITY = 'DEIR_EZ_ZOR_CITY',
  DEIR_EZ_ZOR_SUBURB = 'DEIR_EZ_ZOR_SUBURB',
  RAQQA_CITY = 'RAQQA_CITY',
  RAQQA_SUBURB = 'RAQQA_SUBURB',
  ALSUWIDA_CITY = 'ALSUWIDA_CITY',
  ALSUWIDA_SUBURB = 'ALSUWIDA_SUBURB',
  HOMS_CITY = 'HOMS_CITY',
  HOMS_SUBURB = 'HOMS_SUBURB',
  DARAA_CITY = 'DARAA_CITY',
  DARAA_SUBURB = 'DARAA_SUBURB',
  TARTUS_CITY = 'TARTUS_CITY',
  TARTUS_SUBURB = 'TARTUS_SUBURB',
  LATA_CITY = 'LATA_CITY',
  LATA_SUBURB = 'LATA_SUBURB',
  LATTAKIA_CITY = 'LATTAKIA_CITY',
  LATTAKIA_SUBURB = 'LATTAKIA_SUBURB',
  ALHASAKA_CITY = 'ALHASAKA_CITY',
  ALHASAKA_SUBURB = 'ALHASAKA_SUBURB',
}

export enum HospitalStatus {
  WORKS = 'WORKS',
  STOPPED = 'STOPPED',
  PARTIALLY = 'PARTIALLY',
}

export enum HospitalCategory {
  GENERAL = 'GENERAL',
  PRIVATE = 'PRIVATE',
}

export enum HospitalSpecialization {
  GeneralMedicine = 'طب عام',
  InternalMedicine = 'طب داخلي',
  GeneralSurgery = 'جراحة عامة',
  OrthopedicSurgery = 'جراحة عظام',
  Neurosurgery = 'جراحة أعصاب',
  CardiacSurgery = 'جراحة قلب',
  ThoracicSurgery = 'جراحة صدرية',
  Urology = 'جراحة بولية',
  PlasticSurgery = 'جراحة تجميل',
  Pediatrics = 'أطفال',
  PediatricSurgery = 'جراحة أطفال',
  ObstetricsGynecology = 'نسائية وتوليد',
  Cardiology = 'قلب',
  Neurology = 'أعصاب',
  Dermatology = 'جلدية',
  Ophthalmology = 'عيون',
  Otolaryngology = 'أنف وأذن وحنجرة',
  Anesthesia = 'تخدير',
  Radiology = 'أشعة',
  Laboratory = 'مخبر',
  Emergency = 'إسعاف وطوارئ',
  IntensiveCare = 'عناية مشددة',
  Oncology = 'أورام',
  Nephrology = 'كلى',
  Pulmonology = 'صدرية',
  Gastroenterology = 'جهاز هضمي',
  Hematology = 'دمويات',
  Endocrinology = 'غدد صم',
  Dentistry = 'طب أسنان',
  Veterinary = 'طب بيطري',
  Nutrition = 'تغذية',
  Dialysis = 'غسيل كلى',
  BloodBank = 'بنك الدم',
}

export enum CenterCategory {
  GeneralMedicine = 'طب عام',
  CosmeticDermatology = 'تجميل وصحة الجلد',
  Dentistry = 'أسنان',
  Pediatrics = 'أطفال',
  Cardiology = 'قلب',
  ObstetricsGynecology = 'نسائية وتوليد',
  Oncology = 'أورام',
  Physiotherapy = 'علاج فيزيائي',
  Radiology = 'أشعة',
  Laboratory = 'مخبر',
  Dialysis = 'غسيل كلى',
  Psychiatry = 'طب نفسي',
  Nutrition = 'تغذية',
  Emergency = 'إسعاف وطوارئ',
}

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED_BY_PATIENT = 'cancelled_by_patient',
  CANCELLED_BY_DOCTOR = 'cancelled_by_doctor',
  CANCELLED_BY_ADMIN = 'cancelled_by_admin',
  CANCELLED_BY_SYSTEM = 'cancelled_by_system',
}

export enum GeneralSpecialty {
  HumanMedicine = 'طب_بشري',
  Dentistry = 'طب_أسنان',
  Psychiatry = 'طب_نفسي',
  Veterinary = 'طب_بيطري',
  Physiotherapy = 'علاج_فيزيائي',
}
export enum PrivateMedicineSpecialty {
  GeneralPractitioner = 'طب_عام',
  InternalMedicine = 'طب_داخلي',
  GeneralSurgery = 'جراحة_عامة',
  Pediatrics = 'أطفال',
  ObstetricsGynecology = 'نسائية_وتوليد',
  Cardiology = 'قلب',
  Orthopedics = 'عظمية',
  Neurology = 'عصبية',
  Dermatology = 'جلدية',
  Ophthalmology = 'عيون',
  Otolaryngology = 'أنف_وأذن_وحنجرة',
  Anesthesia = 'تخدير',
  Radiology = 'أشعة',
  Emergency = 'إسعاف_وطوارئ',
  Oncology = 'أورام',
  Nephrology = 'كلى',
  Pulmonology = 'صدرية',
  Gastroenterology = 'هضمية',
  VascularSurgery = 'وعية_دم',
  Endocrinology = 'غدد',
  Neurosurgery = 'دماغ_ونخاع',
  GeneralDentistry = 'طب_أسنان_عام',
  Orthodontics = 'تقويم_أسنان',
  OralMaxillofacialSurgery = 'جراحة_فم_ووجه_وفكين',
  Endodontics = 'علاج_لب_السن',
  PediatricDentistry = 'طب_أسنان_للأطفال',
  FixedProsthodontics = 'تركيبات_ثابتة',
  RemovableProsthodontics = 'تركيبات_متحركة',
  Implantology = 'زراعة_أسنان',
  Periodontics = 'أمراض_اللثة',
  GeneralPsychiatry = 'طب_نفسي_عام',
  DepressionTreatment = 'علاج_الاكتئاب',
  AnxietyTreatment = 'علاج_القلق',
  AddictionTreatment = 'علاج_الإدمان',
  ChildPsychiatry = 'طب_نفسي_أطفال',
  GeneralVeterinary = 'بيطري_عام',
  Pets = 'حيوانات_أليفة',
  Livestock = 'مواشي',
  Poultry = 'دواجن',
  InjuryTreatment = 'علاج_إصابات',
  Rehabilitation = 'إعادة_تأهيل',
  SportsPhysiotherapy = 'علاج_رياضي',
  NeurologicalPhysiotherapy = 'علاج_عصبي',
  GeriatricPhysiotherapy = 'علاج_كبار_السن',
}
export enum NotificationTypes {
  BOOKING_REMINDER = 'booking_reminder',
  BOOKING_CANCELLED_BY_DOCTOR = 'booking_cancelled_by_doctor',
  BOOKING_CANCELLED_BY_USER = 'booking_cancelled_by_user',
  BOOKING_COMPLETED = 'booking_completed',
  BOOKING_RESCHEDULED = 'booking_rescheduled',

  QUESTION_ANSWERED = 'question_answered',

  DOCTOR_APPROVED = 'doctor_approved',
  DOCTOR_REJECTED = 'doctor_rejected',
  HOSPITAL_APPROVED = 'hospital_approved',
  HOSPITAL_REJECTED = 'hospital_rejected',
  CENTER_APPROVED = 'center_approved',
  CENTER_REJECTED = 'center_rejected',

  SUBSCRIPTION_ACTIVATED = 'subscription_activated',
  SUBSCRIPTION_EXPIRING = 'subscription_expiring',
  SUBSCRIPTION_EXPIRED = 'subscription_expired',
  SUBSCRIPTION_RENEWED = 'subscription_renewed',

  SYSTEM_ANNOUNCEMENT = 'system_announcement',
  SYSTEM_UPDATE = 'system_update',
  SYSTEM_MAINTENANCE = 'system_maintenance',

  PROMOTION = 'promotion',
  NEW_OFFER = 'new_offer',
  SPECIAL_DISCOUNT = 'special_discount',
}
export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
  ACTIVE = 'active',
  DELETED = 'deleted',
}

export enum Days {
  SUNDAY = 'sunday',
  MONDAY = 'monday',
  TUESDAY = 'tuesday',
  WEDNESDAY = 'wednesday',
  THURSDAY = 'thursday',
  FRIDAY = 'friday',
  SATURDAY = 'saturday',
}

export enum WorkigEntity {
  CLINIC = 'clinic',
  HOSPITAL = 'hospital',
  CENTER = 'center',
  OTHER = 'other',
}

// subscription.enums.ts
export enum SubscriptionOwnerType {
  DOCTOR = 'doctor',
  HOSPITAL = 'hospital',
  CENTER = 'center',
}

export enum SubscriptionPlanType {
  DAILY = 'daily',
  YEARLY_TIER_1 = 'yearly_tier1',
  YEARLY_TIER_2 = 'yearly_tier2',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  PAUSED = 'paused',
}

export enum DepartmentType {
  RADIOLOGY = 'radiology',
  SURGERY = 'surgery',
  ICU = 'icu',
  LAB = 'lab',
}
export enum Machines {
  XRayMachine = 'جهاز أشعة سينية',
  CTScanner = 'جهاز طبقي محوري',
  MRIMachine = 'جهاز رنين مغناطيسي',
  UltrasoundMachine = 'جهاز موجات فوق صوتية',
  ECGMachine = 'جهاز تخطيط القلب',
  HeartMonitor = 'جهاز مراقبة القلب',
  Ventilator = 'جهاز تنفس اصطناعي',
  ICUMonitor = 'جهاز عناية مركزة',
  InfusionPump = 'جهاز حقن إلكتروني',
  BloodAnalyzer = 'جهاز مختبر دم',
  UrineAnalyzer = 'جهاز مختبر بول',
  BiochemistryAnalyzer = 'جهاز مختبر كيمياء',
  MicrobiologyEquipment = 'جهاز مختبر ميكروبيولوجي',
  EndoscopyDevice = 'جهاز تنظير',
  Gastroscope = 'جهاز منظار معدي',
  Colonoscope = 'جهاز منظار قولوني',
  BoneDensitometer = 'جهاز أشعة عظمية',
  LaserSurgeryDevice = 'جهاز جراحة ليزر',
  NeurosurgeryEquipment = 'جراحة أعصاب',
  PhysiotherapyEquipment = 'جهاز علاج طبيعي',
  AnesthesiaMachine = 'جهاز تخدير',
  DentalChair = 'جهاز أسنان',
  OrthodonticEquipment = 'جهاز تقويم أسنان',
  HearingAid = 'جهاز مساعدة سمعية',
  Nebulizer = 'جهاز تنفس صغير',
  SuctionMachine = 'جهاز شفط إفرازات',
  BloodPressureMonitor = 'جهاز ضغط دم',
  IVInfusionSet = 'جهاز حقن مصل',
  DialysisMachine = 'جهاز غسيل كلوي',
  MammographyMachine = 'جهاز تصوير ثدي',
  EEGMachine = 'جهاز تخطيط مخ',
  RadiotherapyMachine = 'جهاز علاج إشعاعي',
  MedicationPump = 'جهاز مضخة أدوية',
  PulseOximeter = 'جهاز مراقبة أكسجين',
  Thermometer = 'جهاز قياس حرارة',
  Glucometer = 'جهاز قياس سكر',
  PortableOxygen = 'جهاز تنفس محمول',
  ClinicalDiagnosticEquipment = 'جهاز تشخيص سريري',
}

export enum CenterSpecialization {
  MEDICINE = 'medicine',
  DENTISTRY = 'dentistry',
  VETERINARY = 'veterinary',
}

export enum CommonOperation {
  // Cardiology
  OpenHeartSurgery = 'جراحة قلب مفتوح',
  MinimallyInvasiveHeartSurgery = 'جراحة قلب بوحدات صغيرة',
  CardiacCatheterization = 'جراحة قسطرة قلب',
  HeartValveReplacement = 'جراحة زرع صمامات القلب',

  // Neurology
  BrainSurgery = 'جراحة دماغ',
  OpenNeurosurgery = 'جراحة أعصاب مفتوحة',
  BrainTumorSurgery = 'جراحة أورام دماغ',
  SpinalSurgery = 'جراحة عمود فقري',
  PediatricNeurosurgery = 'جراحة أعصاب للأطفال',

  // Orthopedics
  OrthopedicSurgery = 'جراحة عظام',
  KneeReplacement = 'جراحة مفصل الركبة',
  HipReplacement = 'جراحة مفصل الورك',
  FractureSurgery = 'جراحة كسور',
  BoneDeformitySurgery = 'جراحة تشوهات العظام',

  // OB/GYN
  OBGYNSurgery = 'جراحة نساء وتوليد',
  CSection = 'جراحة ولادة قيصرية',
  AbortionSurgery = 'جراحة إجهاض',
  InfertilitySurgery = 'جراحة لعلاج العقم',

  // Ophthalmology
  LensRemovalSurgery = 'جراحة عيون إزالة عدسة',
  LaserEyeSurgery = 'جراحة عيون ليزر',
  GlaucomaSurgery = 'جراحة عيون المياه الزرقاء',

  // ENT
  NasalSurgery = 'جراحة أنف',
  EarSurgery = 'جراحة أذن',
  ThroatSurgery = 'جراحة حنجرة',

  // Dental
  ToothExtraction = 'جراحة أسنان سحب ضرس',
  DentalImplant = 'جراحة أسنان زرع',
  OrthodonticSurgery = 'جراحة أسنان تقويم',

  // Dermatology & Cosmetic
  DermatologicalSurgery = 'جراحة جلدية',
  PlasticSurgery = 'جراحة تجميل',
  LaserSurgery = 'جراحة ليزر',
  BurnSurgery = 'جراحة حروق',

  // Gastroenterology
  DigestiveSystemSurgery = 'جراحة جهاز هضمي',
  StomachSurgery = 'جراحة معدة',
  IntestinalSurgery = 'جراحة أمعاء',
  ColonSurgery = 'جراحة قولون',
  LiverPancreasSurgery = 'جراحة كبد وبنكرياس',

  // Urology
  UrologicalSurgery = 'جراحة مسالك بولية',
  KidneySurgery = 'جراحة كلية',
  BladderSurgery = 'جراحة مثانة',

  // Emergency
  EmergencySurgery = 'جراحة طوارئ',
  TraumaSurgery = 'جراحة إصابات',
  AccidentSurgery = 'جراحة حوادث',

  // Endoscopy
  Laparoscopy = 'جراحة مناظير بطن',
  Thoracoscopy = 'جراحة مناظير صدر',
  UrologicalEndoscopy = 'جراحة مناظير مسالك',
}

export enum AdStatus {
  PENDING = 'pending',
  SCHEDULED = 'scheduled',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  ACTIVE = 'active',
}

export enum PostStatus {
  PUBLISHED = 'published',
  DELETED = 'deleted',
}

export enum OfferStatus {
  PAUSED = 'paused',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum OfferType {
  PRODUCT = 'product',
  SERVICE = 'service',
}

export enum QuestionStatus {
  PENDING = 'pending',
  ANSWERED = 'answered',
  DELETED = 'deleted',
}

export enum AnswerStatus {
  PENDING = 'pending',
  DELETED = 'deleted',
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

export enum EntityRequestStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  CONTACTED = 'contacted',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum LegalAdviceCategory {
  licensing = 'التراخيص الصحية',
  compliance = 'الامتثال القانوني',
}

export enum SystemCategorySettings {
  LIMITS = 'limits',
  PRICING = 'pricing',
  FEATURES = 'features',
  NOTIFICATIONS = 'notifications',
}
