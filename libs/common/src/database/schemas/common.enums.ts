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
  Damascus = 'دمشق',
  RifDimashq = 'ريف دمشق',
  Aleppo = 'حلب',
  Homs = 'حمص',
  Hama = 'حماة',
  Latakia = 'اللاذقية',
  Tartus = 'طرطوس',
  Idlib = 'إدلب',
  Raqqa = 'الرقة',
  DeirEzzor = 'دير الزور',
  AlHasakah = 'الحسكة',
  Daraa = 'درعا',
  Suwayda = 'السويداء',
  Quneitra = 'القنيطرة',
}
export enum DamascusAreas {
  Old_Damascus = 'دمشق القديمة',
  Baghdad_Street = 'شارع بغداد',
  Medhat_Basha_Souk = 'سوق مدحت باشا',
  Al_Hamidiya_Souk = 'سوق الحميدية',
  Al_Midan = 'الميدان',
  Al_Shaalan = 'الشعلان',
  Abu_Rummaneh = 'أبو رمانة',
  Al_Qaymariya = 'القيمرية',
  Al_Maliki = 'المالكي',
  Kafr_Susa = 'كفرسوسة',
  Al_Mazza = 'المزة',
  Muhajirin_Afeef = 'المهاجرين عفيف',
  Muhajirin_Jadat = 'المهاجرين جادات',
  Al_Baramka = 'البرامكة',
  Thawra_Street = 'شارع الثورة',
  Rukn_Al_Din = 'ركن الدين',
  Bab_Srije = 'باب سريجة',
  Bab_Touma = 'باب توما',
  Al_Salihiya = 'الصالحية',
  Al_Hamra = 'الحمرا',
  Sarouja = 'ساروجة',
  Nahr_Aisha = 'نهر عيشة',
  Zahira_New = 'زاهرة جديدة',
  Zahira_Old = 'زاهرة قديمة',
  Dummar_Old = 'دمّر البلد',
  Dummar_Project = 'مشروع دمر',
  Barzeh = 'برزة',
  Barzeh_Housing = 'مساكن برزة',
  Al_Qasaa = 'القصاع',
  Al_Qosour = 'القصور',
  Douylaa = 'دويلعة',
  Al_Qadam = 'القدم',
  Al_Tadamon = 'التضامن',
  Al_Hamah = 'الهامة',
}

export enum RuralDamascusAreas {
  Al_Qaboun = 'القابون',
  Douma = 'دوما',
  Saqba = 'سقبا',
  Arbeen = 'عربين',
  Harasta = 'حرستا',
  Zemelka = 'زملكا',
  Hamouria = 'حمورية',
  Jobar = 'جوبر',
  Muadamiya_AlSham = 'معضمية الشام',
  Nawa = 'نوى',
  Germana = 'جرمانا',
  Qudsaya = 'قدسيا',
  Yalda = 'يلدا',
  Babila = 'ببيلا',
  Beit_Sahm = 'بيت سحم',
  Al_Harjalah = 'الحرجلة',
  Al_Mliha = 'المليحة',
  Al_Zabadani = 'الزبداني',
  Deir_Ashira = 'دير عشيرة',
  Ain_Al_Naser = 'عين الناصر',
  Al_Rehanyah = 'الريحانية',
  Al_Tal = 'التل',
  Al_Qutayfeh = 'القطيفة',
  Harasta_Suburb = 'ضاحية حرستا',
  Maraba = 'معربا',
  Aqraba = 'عقربا',
  Sidi_Miqdad = 'سيدي مقداد',
  Saidnaya = 'صيدنايا',
  Ain_Al_Fijah = 'عين الفيجة',
  Al_Qalamoun = 'القلمون',
  Sahnaya = 'صحنايا',
  Al_Kiswah = 'الكسوة',
}

export enum AleppoAreas {
  Aleppo_Old_City = 'المدينة القديمة',
  Al_Sayfate = 'السيفات',
  Al_Hamdaniya = 'الحمدانية',
  Sheikh_Maqsoud = 'الشيخ مقصود',
  Al_Ansari = 'الأنصاري',
  Al_Kulliya = 'الكلية',
  Al_Shaar = 'الشعار',
  Al_Sakhour = 'الصاخور',
  Al_Khaldiya = 'الخالدية',
  Al_Suryan = 'السريان',
  Al_Muwasalat = 'المواصلات',
  Al_Rashedin = 'الراشدين',
  Salah_Al_Din = 'صلاح الدين',
  Bab_Nayrab = 'حي باب نيرب',
  Bab_Al_Jeel = 'حي باب الجيل',
  Al_Sukkari = 'حي السكري',
  Sheikh_Lotfi = 'حي الشيخ لطفي',
}

export enum HomsAreas {
  Homs_Old_City = 'المدينة القديمة',
  Al_Khaldiya = 'الخالدية',
  Bab_Al_Rakiz = 'باب الركيز',
  Al_Zahra = 'الزهراء',
  Al_Qosour = 'القصور',
  Ain_Al_Zarqa = 'عين الزرقاء',
  Al_Bayada = 'البياضة',
  Wadi_Al_Shater = 'وادي الشاطر',
  Al_Villas = 'حي الفيلات',
  Al_Makhram = 'المخرم',
  Al_Amari = 'العماري',
  Al_Makhram_North = 'المخرم الشمالي',
}

export enum HamaAreas {
  Hama_Old_City = 'المدينة القديمة',
  Al_Qosour = 'القصور',
  Al_Muradi = 'المرادي',
  Al_Jalaa = 'الجلاء',
  Al_Sawameh = 'الصوامع',
  Al_Salamiyah = 'السلمية',
  Halfaya = 'حلفايا',
  Souran = 'صوران',
  Masyaf = 'مصياف',
  Al_Zakat = 'الزكاة',
  Al_Latamineh = 'اللطامنة',
  Al_Iyada = 'العيادة',
}

export enum LatakiaAreas {
  Latakia_Old_City = 'المدينة القديمة',
  Al_Safsafa = 'الصفصافة',
  Jableh = 'جبلة',
  Qardaha = 'القرداحة',
  Kasab = 'كسب',
  Al_Haffa = 'الحفة',
  Rabeea = 'ربيعة',
  Al_Shati = 'الشاطئ',
  Kasab_West = 'الكسب الغربي',
  Old_Jableh = 'جبلة القديمة',
  Ramlat_Al_Bihar = 'رملة البحار',
}

export enum TartousAreas {
  Tartous_Old_City = 'المدينة القديمة',
  Safita = 'صافيتا',
  Banyas = 'بانياس',
  Al_Dreikish = 'الدريكيش',
  Al_Haffa = 'الحفة',
  Tartous_South = 'طرطوس الجنوب',
  Tartous_North = 'طرطوس الشمال',
  Al_Qadmous = 'القدموس',
  Batrumaz = 'بطرماز',
  Al_Hawataniyah = 'الحوطانية',
}

export enum IdlibAreas {
  Idlib_Old_City = 'المدينة القديمة',
  Maaret_Al_Nuuman = 'معرة النعمان',
  Salqin = 'سلقين',
  Ariha = 'أريحا',
  Khan_Sheikhoun = 'خان شيخون',
  Idlib_City = 'إدلب المدينة',
  Kafr_Nabl = 'كفر نبل',
  Jisr_Al_Shughur = 'جسر الشغور',
  Saraqib = 'سراقب',
  Al_Dana = 'الدانا',
}

export enum DaraaAreas {
  Daraa_Old_City = 'المدينة القديمة',
  Daraa_Al_Balda = 'درعا البلدة',
  Daraa_South = 'درعا الجنوب',
  Daraa_North = 'درعا الشمال',
  Tafas = 'طفس',
  Nawa = 'نوى',
  Saida = 'صيدا',
  Al_Harak = 'الحراك',
  Al_Lajat = 'اللجاة',
  Dael = 'داعل',
}

export enum QuneitraAreas {
  Quneitra_Old_City = 'المدينة القديمة',
  Quneitra_City = 'القنيطرة البلدة',
  Hader = 'حضر',
  Khan_Al_Sheikh = 'خان الشيح',
  Mazareeb = 'مزيريب',
  Al_Gharzeh = 'الغرزة',
  Jaba = 'جبا',
}

export enum SweidaAreas {
  Sweida_Old_City = 'المدينة القديمة',
  Sweida_City = 'السويداء البلدة',
  Shahba = 'شهبا',
  Salkhad = 'صلخد',
  Saida = 'صيدا',
  Daraa_North = 'درعا الشمالي',
  Dabba = 'ضبعة',
  Saasa = 'سعسع',
}

export enum HassakehAreas {
  Hassakeh_Old_City = 'المدينة القديمة',
  Hassakeh_City = 'الحسكة البلدة',
  Al_Qehtaniyah = 'القحطانية',
  Ras_Al_Ain = 'رأس العين',
  Al_Shaddadi = 'الشدادي',
  Amouda = 'عامودا',
  Al_Hawl = 'الهول',
}

export enum RaqqaAreas {
  Raqqa_Old_City = 'المدينة القديمة',
  Raqqa_City = 'الرقة البلدة',
  Ain_Issa = 'عين عيسى',
  Tal_Abyad = 'تل أبيض',
  Al_Tabaqa = 'الطبقة',
  Raqqa_North = 'الرقة الشمالي',
  Raqqa_South = 'الرقة الجنوبي',
}

export enum DeirEzzorAreas {
  DeirEzzor_Old_City = 'المدينة القديمة',
  DeirEzzor_South = 'دير الزور الجنوب',
  DeirEzzor_North = 'دير الزور الشمال',
  Al_Mayadeen = 'الميادين',
  Al_Bukamal = 'البوكمال',
  Al_Salihiya = 'الصالحية',
  Al_Hawaij = 'الحوايج',
  Al_Baghdadi = 'البغدادي',
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

export enum CenterSpecialization {
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
  NewDoctorRegistration = 'new_doctor_registration',
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
  FREE_TRIAL = 'free_trial',
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
  Internal_Medicine = 'الطب الداخلي',
  General_Medicine = 'الطب العام',
  Internal_Physician = 'الطب الباطني',

  // الجراحة
  General_Surgery = 'الجراحة العامة',
  Cardiac_Surgery = 'جراحة قلب',
  Neurosurgery = 'جراحة أعصاب',
  Orthopedic_Surgery = 'جراحة عظام',
  Joint_Surgery = 'جراحة مفاصل',
  Vascular_Surgery = 'جراحة أوعية دموية',
  Gastrointestinal_Surgery = 'جراحة جهاز هضمي',
  Liver_Pancreas_Surgery = 'جراحة كبد وبنكرياس',

  // النساء والتوليد
  Gynecology_Obstetrics = 'نساء وتوليد',
  Infertility_Clinic = 'طب العقم',

  // الأطفال
  Pediatrics = 'طب أطفال',
  Neonatology = 'حديثي الولادة',
  Pediatric_ICU = 'العناية المركزة للأطفال',

  // العيون
  Ophthalmology = 'طب العيون',
  Eye_Surgery = 'جراحة عيون',

  // الأسنان
  Dentistry = 'طب الأسنان',
  Dental_Surgery = 'جراحة أسنان',
  Orthodontics = 'تقويم أسنان',

  // الأنف والأذن والحنجرة
  ENT_Clinic = 'طب أنف أذن حنجرة',
  ENT_Surgery = 'جراحة أنف أذن حنجرة',

  // الجلدية والتجميل
  Dermatology = 'طب جلدية',
  Cosmetic_Surgery = 'جراحة تجميل',
  Minor_Cosmetic_Procedure = 'جراحة تجميل صغيرة',
  Tattoo_Removal = 'إزالة وشم',

  // التخدير والعناية المركزة
  Anesthesia = 'التخدير',
  ICU = 'العناية المركزة',

  // الأشعة والتصوير الطبي
  Radiology = 'الأشعة',
  CT_Scan = 'الأشعة المقطعية (طبقي محوري)',
  MRI = 'الرنين المغناطيسي',
  Ultrasound = 'موجات فوق صوتية',
  X_Ray = 'أشعة سينية',

  // المختبرات الطبية
  Blood_Lab = 'مختبر دم',
  Urine_Lab = 'مختبر بول',
  Microbiology_Lab = 'مختبر ميكروبيولوجي',
  Chemistry_Lab = 'مختبر كيمياء',

  // الطوارئ
  Emergency_Department = 'قسم طوارئ',
  Ambulance_Services = 'إسعاف ونقل مريض',
  Emergency_Staff = 'موظف طوارئ',

  // العلاج الطبيعي وإعادة التأهيل
  Physiotherapy = 'علاج طبيعي',
  Rehabilitation = 'إعادة تأهيل',
  Physiotherapy_Technician = 'فني علاج طبيعي',
  Rehabilitation_Specialist = 'أخصائي إعادة تأهيل',

  // التغذية والصحة العامة
  Nutritionist = 'أخصائي تغذية',
  Diet_Therapy = 'تغذية علاجية',
  Public_Health_Specialist = 'أخصائي صحة عامة',
  Public_Health = 'صحة عامة',

  // المسالك البولية والكلى
  Urology = 'مسالك بولية',
  Dialysis = 'غسيل كلوي',

  // الأطباء حسب التخصص
  General_Physician = 'طبيب عام',
  Internal_Physician_Doctor = 'طبيب باطنة',
  Surgeon = 'طبيب جراحة',
  Pediatric_Doctor = 'طبيب أطفال',
  Gynecology_Obstetrics_Doctor = 'طبيب نساء وتوليد',
  Ophthalmologist = 'طبيب عيون',
  Dentist = 'طبيب أسنان',
  ENT_Doctor = 'طبيب أنف أذن حنجرة',
  Dermatologist = 'طبيب جلدية',
  Anesthesiologist = 'طبيب تخدير',
  Neurologist = 'طبيب أعصاب',
  Oncologist = 'طبيب أورام',
  Vascular_Doctor = 'طبيب أوعية دموية',

  // الصيادلة
  Pharmacist = 'صيدلي',
  Clinical_Pharmacist = 'صيدلي سريري',

  // الممرضين والمساعدين
  Nurse = 'ممرض',
  Female_Nurse = 'ممرضة',
  Nursing_Assistant = 'مساعد تمريض',

  // الفنيين
  Lab_Technician = 'فني مختبر',
  Radiology_Technician = 'فني أشعة',
  Surgery_Technician = 'فني جراحة',

  // موظفين إداريين
  Medical_Records_Staff = 'موظف سجلات طبية',

  // اختصاصات أخرى
  Psychologist = 'أخصائي نفسية',
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

export enum CommonSurgery {
  Heart_OpenSurgery = 'جراحة قلب مفتوح',
  Heart_SmallUnitSurgery = 'جراحة قلب بوحدات صغيرة',
  Heart_CatheterSurgery = 'جراحة قسطرة قلب',
  Heart_ValveReplacement = 'جراحة زرع صمامات القلب',

  // قسم الدماغ والأعصاب
  Brain_Surgery = 'جراحة دماغ',
  Nerve_OpenSurgery = 'جراحة أعصاب مفتوحة',
  Brain_TumorSurgery = 'جراحة أورام دماغ',
  Spine_Surgery = 'جراحة عمود فقري',
  Pediatric_NerveSurgery = 'جراحة أعصاب للأطفال',

  // قسم العظام والمفاصل
  Bones_Surgery = 'جراحة عظام',
  Knee_Joint_Surgery = 'جراحة مفصل الركبة',
  Hip_Joint_Surgery = 'جراحة مفصل الورك',
  Fracture_Surgery = 'جراحة كسور',
  Bone_Deformity_Surgery = 'جراحة تشوهات العظام',

  // قسم النساء والتوليد
  Women_Obstetrics_Surgery = 'جراحة نساء وتوليد',
  Cesarean_Section = 'جراحة ولادة قيصرية',
  Abortion_Surgery = 'جراحة إجهاض',
  Infertility_Surgery = 'جراحة لعلاج العقم',

  // قسم العيون
  Eye_LensRemoval = 'جراحة عيون إزالة عدسة',
  Eye_Laser = 'جراحة عيون ليزر',
  Eye_Glaucoma = 'جراحة عيون المياه الزرقاء',

  // قسم الأنف والأذن والحنجرة
  Nose_Surgery = 'جراحة أنف',
  Rhinoplasty = 'جراحة تجميل الأنف',
  Sinus_Surgery = 'جراحة الجيوب الأنفية',
  Ear_Surgery = 'جراحة أذن',
  Throat_Surgery = 'جراحة حنجرة',

  // قسم الأسنان
  Dental_ToothExtraction = 'جراحة أسنان سحب ضرس',
  Dental_Implant = 'جراحة أسنان زرع',
  Dental_Braces = 'جراحة أسنان تقويم',
  Dental_Fillings = 'جراحة أسنان حشوات',

  // قسم الجلدية والتجميل
  Dermatology_Surgery = 'جراحة جلدية',
  Cosmetic_Surgery = 'جراحة تجميل',
  Facelift_Surgery = 'جراحة شد الوجه',
  Botox_Surgery = 'حقن بوتوكس',
  Laser_Surgery = 'جراحة ليزر',
  Burn_Surgery = 'جراحة حروق',
  Superficial_Burn_Surgery = 'جراحة حروق سطحية',
  Liposuction = 'شفط الدهون',
  Breast_Surgery = 'جراحة تكبير/تصغير الثدي',

  // قسم الجهاز الهضمي
  Gastrointestinal_Surgery = 'جراحة جهاز هضمي',
  Stomach_Surgery = 'جراحة معدة',
  Intestine_Surgery = 'جراحة أمعاء',
  Colon_Surgery = 'جراحة قولون',
  Liver_Pancreas_Surgery = 'جراحة كبد وبنكرياس',

  // قسم المسالك البولية
  Urinary_Surgery = 'جراحة مسالك بولية',
  Kidney_Surgery = 'جراحة كلية',
  Bladder_Surgery = 'جراحة مثانة',

  // قسم الطوارئ
  Emergency_Surgery = 'جراحة طوارئ',
  Injury_Surgery = 'جراحة إصابات',
  Accident_Surgery = 'جراحة حوادث',

  // قسم المناظير
  Laparoscopy_Abdomen = 'جراحة مناظير بطن',
  Laparoscopy_Chest = 'جراحة مناظير صدر',
  Laparoscopy_Urology = 'جراحة مناظير مسالك',
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
  FreeCheckup = 'معاينة مجانية',
  FreeConsultation = 'استشارة مجانية',
  FreeExamination = 'فحص مجاني',
  FreeSession = 'جلسة مجانية',
  FreeFollowUp = 'مراجعة مجانية',
  ServiceDiscount = 'حسم على الخدمة',
  PercentageDiscount = 'حسم بنسبة مئوية',
  DiscountedPackage = 'باقة بسعر مخفض',
  FreeServiceWithService = 'خدمة مجانية مع خدمة',
  LimitedTimeOffer = 'عرض لفترة محدودة',
  Other = 'غير ذلك',
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
