import { Days, WorkigEntity } from '@app/common/database/schemas/common.enums';
export interface SlotGenerationEvent {
  eventType: 'SLOTS_GENERATE';
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

export interface SlotGenerationFutureEvent {
  eventType: 'SLOTS_GENERATE_FOR_FUTURE';
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
    patientId: string;
    patientName: string;
    fcmToken: string;
    bookingId: string;
    appointmentDate: Date;
    appointmentTime: string;
    reason: string;
    type: string;
  };
  metadata: {
    source: 'notification-service';
    version: '1.0';
  };
}
