import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CommonOperation, DepartmentType, Machines } from './common.enums';

@Schema({ timestamps: true, collection: 'common_departments' })
export class CommonDepartment extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Hospital', index: true })
  hospitalId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Center', index: true })
  centerId: Types.ObjectId;

  @Prop({ enum: DepartmentType, index: true })
  type: DepartmentType;

  @Prop({
    type: [
      {
        name: { type: String },
        id: { type: String }, // External/Employee ID
        // Link to the PrivateSpecialization collection
        specialization: { type: Types.ObjectId, ref: 'PrivateSpecialization' },
      },
    ],
  })
  doctors: {
    name: string;
    id: string;
    specialization: Types.ObjectId;
  }[];

  @Prop({ type: [Object] }) nurses: {
    name: string;
    id: string;
  }[];

  @Prop({ type: String, enum: Machines, index: true })
  machines_type: Machines;

  // 2. Define the array with Enum validation for the "name" field
  @Prop({
    type: [
      {
        name: { type: String, enum: Object.values(Machines) }, // Enforces Enum at DB level
        id: { type: String },
        location: { type: String },
      },
    ],
  })
  machines: {
    name: Machines; // Enforces Enum at TypeScript level
    id: string;
    location: string;
  }[];

  @Prop({
    type: [
      {
        name: { type: String, enum: Object.values(CommonOperation) }, // Enforces Enum at DB level
        id: { type: String },
      },
    ],
  })
  operations: {
    name: CommonOperation; // Enforces Enum at TypeScript level
    id: string;
  }[];

  @Prop({ type: Number, required: false })
  numberOfBeds?: number;
}

export const CommonDepartmentSchema =
  SchemaFactory.createForClass(CommonDepartment);

// Replace the individual index: true on those fields with this at the bottom:
CommonDepartmentSchema.index({ hospitalId: 1, type: 1 });
CommonDepartmentSchema.index({ centerId: 1, type: 1 });
// Index for finding a specific doctor across all departments
CommonDepartmentSchema.index({ 'doctors.id': 1 });

// Index for finding a specific machine by its ID
CommonDepartmentSchema.index({ 'machines.id': 1 });
CommonDepartmentSchema.index({ 'operations.id': 1 });
CommonDepartmentSchema.index({ numberOfBeds: 1 }, { sparse: true });
