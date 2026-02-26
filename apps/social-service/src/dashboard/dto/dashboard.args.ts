import { ArgsType, Field, Int } from '@nestjs/graphql';
import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsString,
} from 'class-validator';

@ArgsType()
export class DashboardArgs {
  @Field({ description: 'Doctor authAccountId from JWT' })
  @IsString()
  doctorAccountId: string;

  @Field({ nullable: true, description: 'YYYY-MM-DD — defaults to today' })
  @IsOptional()
  @IsDateString()
  selectedDate?: string;

  @Field(() => Int, { nullable: true, defaultValue: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Field(() => Int, { nullable: true, defaultValue: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

@ArgsType()
export class CalendarArgs {
  @Field()
  @IsString()
  doctorAccountId: string;

  @Field(() => Int, { description: 'Full year e.g. 2026' })
  @IsInt()
  year: number;

  @Field(() => Int, { description: '1–12' })
  @IsInt()
  month: number;
}

@ArgsType()
export class RevenueChartArgs {
  @Field()
  @IsString()
  doctorAccountId: string;

  @Field({ nullable: true, description: 'day | week | month — default: week' })
  @IsOptional()
  period?: 'day' | 'week' | 'month';
}

@ArgsType()
export class AppointmentsArgs {
  @Field()
  @IsString()
  doctorAccountId: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  date?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  status?: string;

  @Field(() => Int, { nullable: true, defaultValue: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Field(() => Int, { nullable: true, defaultValue: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
