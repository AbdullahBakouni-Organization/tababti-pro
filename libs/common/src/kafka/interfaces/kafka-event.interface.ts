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
