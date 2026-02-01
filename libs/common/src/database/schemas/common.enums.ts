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
  PRIVATE_HOSPITAL = 'PRIVATE_HOSPITAL',
  PSYCHIATRIC = 'PSYCHIATRIC',
  INTERNAL_MEDICINE = 'INTERNAL_MEDICINE',
  OBSTETRICS_GYNECOLOGY = 'OBSTETRICS_GYNECOLOGY',
  GENERAL_CARDIOLOGY = 'GENERAL_CARDIOLOGY',
  OPHTHALMOLOGY = 'OPHTHALMOLOGY',
  PEDIATRICS = 'PEDIATRICS',
  WOMEN_CHILDREN = 'WOMEN_CHILDREN',
  EMERGENCY = 'EMERGENCY',
}
export enum CenterCategory {
  Beautification = 'Beautification',
  Health = 'Health',
  X_rays = 'X_rays',
}

export enum ContentCategory {
  POST = 'post',
  STORY = 'story',
  AD = 'ad',
}

export enum BookingStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

export enum PublicSpecializationEnums {
  MEDICINE = 'medicine',
  DENTISTRY = 'dentistry',
  VETERINARY = 'veterinary',
}

export enum NotificationType {
  NEW_ANSWER = 'new_answer',
  NEW_BOOKING = 'new_booking',
  BOOKING_STATUS_CHANGED = 'booking_status_changed',
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
