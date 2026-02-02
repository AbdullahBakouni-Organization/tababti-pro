import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { SystemCategorySettings } from './common.enums';

@Schema({ timestamps: true, collection: 'systemconfig' })
export class SystemConfig extends Document {
  @Prop({ type: String, required: true, unique: true })
  key: string;

  @Prop({ required: true })
  value: any;

  @Prop({ type: String, required: false })
  description: string;

  @Prop({
    type: String,
    enum: Object.values(SystemCategorySettings),
    default: SystemCategorySettings.PRICING,
    index: true,
  })
  status: SystemCategorySettings;

  @Prop({ type: Boolean, default: false })
  isPublic: boolean;

  @Prop({ type: Boolean, default: true })
  isEditable: boolean;
}
export const SystemConfigSchema = SchemaFactory.createForClass(SystemConfig);
