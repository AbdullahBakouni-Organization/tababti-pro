// libs/common/kafka/events/topics.ts
export const KAFKA_TOPICS = {
  // Booking Events
  BOOKING_CREATED: 'booking.created',
  BOOKING_CANCELLED_BY_USER: 'booking.cancelled.by.user',
  BOOKING_CANCELLED_BY_DOCTOR: 'booking.cancelled.by.doctor',
  BOOKING_CANCELLED_BY_SYSTEM: 'booking.cancelled.by.system',
  BOOKING_COMPLETED: 'booking.completed',
  BOOKING_REMINDER: 'booking.reminder',

  // Doctor Events
  DOCTOR_PROFILE_UPDATED: 'doctor.profile.updated',
  DOCTOR_WORKING_HOURS_UPDATED: 'doctor.working.hours.updated',
  DOCTOR_INSPECTION_TIME_UPDATED: 'doctor.inspection.time.updated',
  DOCTOR_HOLIDAY_ADDED: 'doctor.holiday.added',
  DOCTOR_APPROVED: 'doctor.approved',
  DOCTOR_ADS_CREATED: 'doctor.ads.created',
  DOCTOR_OFFERS_CREATED: 'doctor.offers.created',

  // Hospital/Center Events
  HOSPITAL_PROFILE_UPDATED: 'hospital.profile.updated',
  HOSPITAL_APPROVED: 'hospital.approved',
  CENTER_PROFILE_UPDATED: 'center.profile.updated',
  CENTER_APPROVED: 'center.approved',

  // Social Events
  QUESTION_CREATED: 'question.created',
  QUESTION_ANSWERED: 'question.answered',
  RATING_CREATED: 'rating.created',

  // Cache Invalidation Events
  CACHE_INVALIDATE: 'cache.invalidate',
};
