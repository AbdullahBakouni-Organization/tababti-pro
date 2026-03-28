import { Days, WorkigEntity } from '@app/common/database/schemas/common.enums';
export interface SlotGenerationEvent {
  eventType: 'SLOTS_GENERATE';
  timestamp: Date;
  data: {
    doctorId: string;
    WorkingHours: Array<{
      day: Days;
      location: {
        type: WorkigEntity;
        entity_name: string;
        address: string;
      };
      startTime: string;
      endTime: string;
    }>;
    inspectionDuration: number;
    inspectionPrice?: number;
    doctorInfo: {
      fullName: string;
    };
  };
  metadata?: {
    source: 'doctor-service';
    version: '1.0';
  };
}

export interface SlotGenerationTodayEvent {
  eventType: 'SLOTS_GENERATE_FOR_TODAY';
  timestamp: Date;
  data: {
    doctorId: string;
    workingHours: Array<{
      day: Days;
      location: {
        type: WorkigEntity;
        entity_name: string;
        address: string;
      };
      startTime: string;
      endTime: string;
    }>;
    inspectionDuration: number;
    inspectionPrice?: number;
    doctorInfo: {
      fullName: string;
    };
  };
  metadata: {
    source: 'doctor-service';
    version: '1.0';
  };
}

export interface WorkingHoursAddedEvent {
  eventType: 'WORKING_HOURS_ADDED';
  timestamp: Date;
  data: {
    doctorId: string;
    workingHours: Array<{
      day: Days;
      location: {
        type: WorkigEntity;
        entity_name: string;
        address: string;
      };
      startTime: string;
      endTime: string;
    }>;
    inspectionDuration: number;
  };
  metadata: {
    source: 'doctor-service';
    version: '1.0';
  };
}

export interface SlotRefreshedEvent {
  eventType: 'SLOTS_REFRESHED';
  timestamp: Date;
  data: {
    doctorId: string;
    slotId: string;
    date: Date;
    inspectionDuration: number;
    startTime: string;
    endTime: string;
    location: string;
    price: number;
  };
  metadata: {
    source: 'slot-management-service';
    version: '1.0';
  };
}

export interface WorkingHoursUpdatedEvent {
  doctorId: string;
  oldWorkingHours: Array<{
    day: Days;
    location: {
      type: WorkigEntity;
      entity_name: string;
      address: string;
    };
    startTime: string;
    endTime: string;
  }>;
  inspectionDuration: number;
  inspectionPrice: number;
  newWorkingHours: Array<{
    day: Days;
    location: {
      type: WorkigEntity;
      entity_name: string;
      address: string;
    };
    startTime: string;
    endTime: string;
  }>;
  version: number;
  updatedDays: Array<Days>;
}

export interface BookingCancelledNotificationEvent {
  eventType: 'BOOKING_CANCELLED_NOTIFICATION';
  timestamp: Date;
  data: {
    patientId?: string;
    patientName?: string;
    doctorId: string;
    doctorName: string;
    fcmToken: string;
    bookingId: string;
    appointmentDate: string;
    appointmentTime: string;
    reason: string;
    type: 'DOCTOR_CANCELLED';
  };
  metadata: {
    source: 'doctor-service';
    version: '1.0';
  };
}

export interface BookingCancelledNotificationEventByUser {
  eventType: 'BOOKING_CANCELLED_BY_USER';
  timestamp: Date;
  data: {
    patientId: string;
    patientName: string;
    doctorId: string;
    doctorName: string;
    fcmToken: string;
    bookingId: string;
    appointmentDate: string;
    appointmentTime: string;
    reason: string;
    type: 'USER_CANCELLED';
  };
  metadata: {
    source: 'user-service';
    version: '1.0';
  };
}

export interface BookingCompletedNotificationEvent {
  eventType: 'BOOKING_COMPLETED';
  timestamp: Date;
  data: {
    patientId: string;
    patientName: string;
    doctorId: string;
    doctorName: string;
    fcmToken: string;
    bookingId: string;
    appointmentDate: Date;
    appointmentTime: string;
    notes?: string;
    type: 'BOOKING_COMPLETED';
  };
  metadata: {
    source: string;
    version: string;
  };
}

export interface BookingRescheduledNotificationEvent {
  eventType: 'BOOKING_RESCHEDULED_NOTIFICATION';
  timestamp: Date;
  data: {
    patientId: string;
    patientName: string;
    doctorId: string;
    doctorName: string;
    fcmToken: string;
    bookingId: string;
    appointmentDate: Date;
    appointmentTime: string;
    reason: string;
    type: 'BOOKING_RESCHEDULED';
  };
  metadata: {
    source: string;
    version: string;
  };
}

export interface AdminApprovedPostEvent {
  eventType: 'ADMIN_APPROVED_POST';
  timestamp: Date;
  data: {
    doctorId: string;
    doctorName: string;
    fcmToken: string;
    postId: string;
  };
  metadata: {
    source: string;
    version: string;
  };
}

export interface AdminRejectedPostEvent {
  eventType: 'ADMIN_REJECTED_POST';
  timestamp: Date;
  data: {
    doctorId: string;
    doctorName: string;
    fcmToken: string;
    reason: string;
    postId: string;
  };
  metadata: {
    source: string;
    version: string;
  };
}

export interface AdminApprovedGalleryImagesEvent {
  eventType: 'ADMIN_APPROVED_GALLERY_IMAGES';
  timestamp: Date;
  data: {
    doctorId: string;
    doctorName: string;
    fcmToken: string;
    GalleryIds: string[];
  };
  metadata: {
    source: string;
    version: string;
  };
}

export interface AdminRejectedGalleryImagesEvent {
  eventType: 'ADMIN_REJECTED_GALLERY_IMAGES';
  timestamp: Date;
  data: {
    doctorId: string;
    doctorName: string;
    fcmToken: string;
    rejectionReason: string;
    GalleryIds: string[];
  };
  metadata: {
    source: string;
    version: string;
  };
}

export interface AdminApprovedUserQuestionsEvent {
  eventType: 'ADMIN_APPROVED_USER_QUESTIONS';
  timestamp: Date;
  data: {
    userId: string;
    userName: string;
    fcmToken: string;
    questionIds: string[];
  };
  metadata: { source: string; version: string };
}

export interface AdminRejectedUserQuestionsEvent {
  eventType: 'ADMIN_REJECTED_USER_QUESTIONS';
  timestamp: Date;
  data: {
    userId: string;
    userName: string;
    fcmToken: string;
    questionIds: string[];
    rejectionReason: string;
  };
  metadata: { source: string; version: string };
}
