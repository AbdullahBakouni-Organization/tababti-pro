import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'insurancecompanies' })
export class InsuranceCompany extends Document {
  @Prop() name: string;
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }] })
  users: Types.ObjectId[];
}

export const InsuranceCompanySchema =
  SchemaFactory.createForClass(InsuranceCompany);
