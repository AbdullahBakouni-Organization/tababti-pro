import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { EntityRequestStatus, Machines, UserRole } from './common.enums';

// Define Enums for better type safety

@Schema({ timestamps: true, collection: 'medical_equipment_requests' })
export class MedicalEquipmentRequest extends Document {
  @Prop({ type: String, enum: UserRole, required: true, index: true })
  requesterType: UserRole;

  @Prop({ type: Types.ObjectId, index: true })
  requesterId: Types.ObjectId;

  @Prop({ type: String, enum: Machines })
  equipmentType: Machines;

  @Prop({ type: Number, required: false })
  quantity: number;

  @Prop({ type: String, required: false })
  note: string;

  @Prop({
    type: String,
    enum: Object.values(EntityRequestStatus),
    default: EntityRequestStatus.PENDING,
    index: true,
  })
  status: EntityRequestStatus;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const MedicalEquipmentRequestSchema = SchemaFactory.createForClass(
  MedicalEquipmentRequest,
);

MedicalEquipmentRequestSchema.index({
  requesterType: 1,
  requesterId: 1,
  equipmentType: 1,
  status: 1,
});
