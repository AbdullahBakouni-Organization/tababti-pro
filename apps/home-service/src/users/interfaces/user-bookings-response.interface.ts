// user-bookings-response.interface.ts
export interface CancelledByInfo {
  cancelledBy: 'DOCTOR' | 'PATIENT' | 'SYSTEM';
  reason?: string;
}

export interface BookingResponseItem {
  bookingId: string;
  status: string;
  bookingDate: string;
  slot: {
    startTime: string;
    endTime: string;
    location: {
      type: string;
      entity_name: string;
      address: string;
    };
    inspectionPrice: number;
  };
  doctor: {
    fullName: string;
    image: string | null;
  };
  cancellation?: CancelledByInfo;
}

export interface UserBookingsResponse {
  booking: {
    data: BookingResponseItem[];
  };
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
