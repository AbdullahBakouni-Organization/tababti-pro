import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  ApprovalStatus,
  Days,
  GalleryImageStatus,
  Gender,
  WorkigEntity,
} from './common.enums';
import { Session, SessionSchema } from './session.schema';
import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { HydratedDocument } from 'mongoose';
export interface DoctorMethods {
  comparePassword?: (candidatePassword: string) => Promise<boolean>;
  incrementFailedAttempts?: () => void;
  resetFailedAttempts?: () => void;
  getActiveSessionsCount?: () => number;
  removeAllSessions?: () => Promise<void>;
  removeDevice?: (deviceId: string) => void;
}
interface GalleryImageWithStatus {
  imageId: string; // Unique ID for this image
  url: string; // Public URL
  fileName: string; // MinIO filename
  bucket: string; // MinIO bucket
  description?: string; // Optional description
  uploadedAt: Date; // Upload timestamp
  status: GalleryImageStatus; // ✅ PENDING, APPROVED, REJECTED
  approvedAt?: Date; // When approved
  approvedBy?: string; // Admin ID who approved
  rejectionReason?: string; // Why rejected
}
const scryptAsync = promisify(scrypt);
@Schema({ timestamps: true, collection: 'doctors' })
export class Doctor extends Document {
  @Prop({ type: Types.ObjectId, ref: 'AuthAccount', unique: true })
  authAccountId: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50,
    match: /^[\p{L} ._-]+$/u,
  })
  firstName: string;

  @Prop({
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50,
    match: /^[\p{L} ._-]+$/u,
  })
  lastName: string;

  @Prop({
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50,
    match: /^[\p{L} ._-]+$/u,
  })
  middleName: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ type: Number }) latitude?: number;

  @Prop({ type: Number }) longitude?: number;

  @Prop({ type: Types.ObjectId, ref: 'Cities' })
  cityId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'SubCities' })
  subcityId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'PrivateSpecialization' })
  privateSpecializationId: Types.ObjectId;

  @Prop({ required: false, type: String }) // Image is optional
  image?: string;

  @Prop()
  imageFileName?: string;

  /**
   * Profile image bucket name
   * Example: tababti-doctors
   */
  @Prop()
  imageBucket?: string;

  /**
   * Gallery Images (multiple images)
   * Array of images showing clinic, equipment, team, etc.
   * Maximum 20 images per doctor
   */
  @Prop({
    type: [
      {
        imageId: { type: String, required: true },
        url: { type: String, required: true },
        fileName: { type: String, required: true },
        bucket: { type: String, required: true },
        description: { type: String },
        uploadedAt: { type: Date, default: Date.now },
        status: {
          type: String,
          enum: Object.values(GalleryImageStatus),
          default: GalleryImageStatus.PENDING,
        },
        approvedAt: { type: Date },
        approvedBy: { type: String },
        rejectionReason: { type: String },
      },
    ],
    default: [],
  })
  gallery?: GalleryImageWithStatus[];

  @Prop({
    type: {
      // Certificate Image
      certificateImage: { type: String },
      certificateImageFileName: { type: String },
      certificateImageBucket: { type: String },

      // License Image
      licenseImage: { type: String },
      licenseImageFileName: { type: String },
      licenseImageBucket: { type: String },

      // Certificate Document (PDF)
      certificateDocument: { type: String },
      certificateDocumentFileName: { type: String },
      certificateDocumentBucket: { type: String },

      // License Document (PDF)
      licenseDocument: { type: String },
      licenseDocumentFileName: { type: String },
      licenseDocumentBucket: { type: String },
    },
    default: {},
  })
  documents: {
    // Certificate Image
    certificateImage?: string; // Public URL: http://localhost:9000/bucket/path/uuid.jpg
    certificateImageFileName?: string; // MinIO filename: doctors/123/certificates/images/uuid.jpg
    certificateImageBucket?: string; // Bucket name: tababti-doctors

    // License Image
    licenseImage?: string;
    licenseImageFileName?: string;
    licenseImageBucket?: string;

    // Certificate Document
    certificateDocument?: string;
    certificateDocumentFileName?: string;
    certificateDocumentBucket?: string;

    // License Document
    licenseDocument?: string;
    licenseDocumentFileName?: string;
    licenseDocumentBucket?: string;
  };
  @Prop({
    type: [{ type: Object }],
    index: true,
    required: true,
  })
  phones: {
    whatsup: string[];
    clinic: string[];
    normal: string[];
  }[];

  @Prop({
    required: false,
    trim: true,
    minlength: 3,
    maxlength: 50,
    match: /^[\p{L}\p{N}._-]+$/u,
  }) // Address is optional
  address?: string;

  @Prop({
    required: false,
    type: String,
    trim: true,
    maxlength: 500,
  })
  bio?: string;

  @Prop({ type: [Object] })
  hospitals: {
    name: string;
    id: string;
    location: string;
  }[];

  @Prop({ type: Number })
  inspectionDuration: number;

  @Prop({ type: Number })
  inspectionPrice: number;

  @Prop({ type: [Object] }) centers: {
    name: string;
    id: string;
    location: string;
  }[];

  @Prop({ type: [Object] }) insuranceCompanies: {
    name: string;
    id: string;
    location: string;
  }[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'PublicSpecialization' }] })
  publicSpecializationId: Types.ObjectId;

  @Prop({ type: [Object] }) workingHours: {
    day: Days;
    location: {
      type: WorkigEntity;
      entity_name: string;
      address: string;
    };
    startTime: string; // format: "09:00"
    endTime: string; // format: "17:00"
  }[];

  @Prop({ default: 1 })
  workingHoursVersion: number;

  @Prop({ type: String, enum: Gender })
  gender: Gender;

  @Prop({ min: 1, max: 5 })
  rating: number;

  @Prop({ type: Types.ObjectId, ref: 'Subscription' })
  subscriptionId: Types.ObjectId;

  @Prop({ default: false })
  isSubscribed: boolean;

  @Prop({
    required: true,
    type: String,
    enum: ApprovalStatus,
  })
  status: ApprovalStatus;

  @Prop({ type: Number })
  searchCount: number;

  @Prop({ type: Number })
  profileViews: number;

  @Prop({ type: String, maxlength: 4096 })
  deviceTokens?: string[];

  @Prop()
  rejectionReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'Admin' })
  approvedBy?: Types.ObjectId;

  @Prop()
  approvedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Admin' })
  rejectedBy?: Types.ObjectId;

  @Prop()
  rejectedAt?: Date;

  @Prop()
  registeredAt?: Date;

  // `select: false` so `findOne()` does not ship the refresh-token hashes,
  // IPs and user-agents of every live session on every authenticated request.
  // The auth service explicitly opts in with `.select('+sessions +maxSessions')`.
  @Prop({ type: [SessionSchema], default: [], select: false })
  sessions: Session[];

  @Prop({ default: 5, select: false }) // Max 5 concurrent sessions
  maxSessions: number;

  @Prop({ type: Number })
  yearsOfExperience: number;

  @Prop({ type: Date })
  experienceStartDate: Date;
  // ==================== SECURITY ====================

  @Prop({ default: 0 })
  failedLoginAttempts: number;

  @Prop()
  lockedUntil?: Date;

  @Prop()
  lastLoginAt?: Date;

  @Prop()
  lastLoginIp?: string;

  @Prop({ default: false })
  twoFactorEnabled: boolean;

  @Prop({ select: false })
  twoFactorSecret?: string;

  @Prop({ required: true, type: String })
  city: string; // City enum value

  @Prop({ required: true })
  subcity: string;

  @Prop({ required: true, type: String })
  publicSpecialization: string; // PublicSpecialization enum

  @Prop({ required: true, type: String })
  privateSpecialization: string; // PrivateSpecialization enum

  @Prop({ type: String, maxlength: 4096 })
  fcmToken?: string;
}
export const DoctorSchema = SchemaFactory.createForClass(Doctor);

DoctorSchema.index({
  cityId: 1,
  gender: 1,
  publicSpecializationId: 1,
  inspectionDuration: 1,
  inspectionPrice: 1,
  rating: -1,
});

DoctorSchema.index({
  publicSpecializationId: 1,
  cityId: 1,
  gender: 1,
  inspectionDuration: 1,
  inspectionPrice: 1,
  rating: 1,
});
DoctorSchema.index({
  publicSpecializationId: 1,
});
DoctorSchema.index({
  publicSpecializationId: 1,
  cityId: 1,
  inspectionPrice: 1,
});
DoctorSchema.index({
  cityId: 1,
  publicSpecializationId: 1,
  inspectionPrice: 1,
});
DoctorSchema.index({
  yearsOfExperience: 1,
});

DoctorSchema.index({
  publicSpecializationId: 1,
  rating: -1,
});
DoctorSchema.index({
  gender: 1,
  rating: 1,
});

DoctorSchema.index({
  firstName: 1,
});
DoctorSchema.index({
  rating: 1,
});
DoctorSchema.index({
  lastName: 1,
});

DoctorSchema.index({
  middleName: 1,
});
DoctorSchema.index({
  latitude: 1,
  longitude: 1,
});
DoctorSchema.index({
  inspectionDuration: 1,
});
DoctorSchema.index({
  inspectionPrice: 1,
});

// ============================================
// Virtual Fields
// ============================================

DoctorSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.middleName} ${this.lastName}`;
});

DoctorSchema.virtual('activeSessions').get(function () {
  return this.sessions.filter((s) => s.isActive);
});

DoctorSchema.virtual('isAccountLocked').get(function () {
  if (!this.lockedUntil) return false;
  return new Date() < this.lockedUntil;
});

// / ============================================
// Pre-save Middleware
// ============================================

DoctorSchema.pre('save', async function () {
  // Hash password if modified
  if (this.isModified('password')) {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scryptAsync(this.password, salt, 64)) as Buffer;
    this.password = `${salt}.${derivedKey.toString('hex')}`;
  }
});

// ============================================
// Instance Methods
// ============================================

DoctorSchema.methods.comparePassword = async function (
  this: Doctor,
  candidatePassword: string,
): Promise<boolean> {
  const [salt, storedHash] = this.password.split('.');
  const derivedKey = (await scryptAsync(candidatePassword, salt, 64)) as Buffer;
  const storedHashBuffer = Buffer.from(storedHash, 'hex');
  return timingSafeEqual(derivedKey, storedHashBuffer);
};

DoctorSchema.methods.addSession = function (
  this: Doctor,
  sessionData: Partial<Session>,
) {
  // Remove oldest session if max limit reached
  if (this.sessions.length >= this.maxSessions) {
    this.sessions.sort(
      (a, b) =>
        new Date(a.lastActivityAt).getTime() -
        new Date(b.lastActivityAt).getTime(),
    );
    this.sessions.shift(); // Remove oldest
  }

  this.sessions.push(sessionData as Session);
};

DoctorSchema.methods.removeSession = function (
  this: Doctor,
  sessionId: string,
) {
  this.sessions = this.sessions.filter((s) => s.sessionId !== sessionId);
};

DoctorSchema.methods.removeDevice = function (this: Doctor, deviceId: string) {
  this.sessions = this.sessions.filter((s) => s.deviceId !== deviceId);
};

DoctorSchema.methods.removeAllSessions = function (this: Doctor) {
  this.sessions = [];
};

DoctorSchema.methods.updateSessionActivity = function (
  this: Doctor,
  sessionId: string,
) {
  const session = this.sessions.find((s) => s.sessionId === sessionId);
  if (session) {
    session.lastActivityAt = new Date();
  }
};

DoctorSchema.methods.getActiveSessionsCount = function (this: Doctor): number {
  // `sessions` is `select: false` — if the caller didn't opt it back in via
  // `.select('+sessions')` the field is undefined here. Treat that as "no
  // known sessions" rather than crashing the request.
  return (this.sessions ?? []).filter((s) => s.isActive).length;
};

DoctorSchema.methods.isSessionActive = function (
  this: Doctor,
  sessionId: string,
): boolean {
  const session = this.sessions.find((s) => s.sessionId === sessionId);
  return session ? session.isActive : false;
};

// Lock account after 5 failed attempts
DoctorSchema.methods.incrementFailedAttempts = function (this: Doctor) {
  this.failedLoginAttempts += 1;

  if (this.failedLoginAttempts >= 3) {
    this.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
  }
};

DoctorSchema.methods.resetFailedAttempts = function (this: Doctor) {
  this.failedLoginAttempts = 0;
  this.lockedUntil = undefined;
};
export type DoctorDocument = HydratedDocument<Doctor> & DoctorMethods;
