import { ArgsType, Field, Int } from '@nestjs/graphql';
import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsIn,
} from 'class-validator';

// ─── Helper ───────────────────────────────────────────────────────────────────

export function resolveRefDate(selectedDate?: string): Date {
  if (!selectedDate) return new Date();
  const d = new Date(selectedDate);
  return isNaN(d.getTime()) ? new Date() : d;
}

// ─── DashboardArgs ────────────────────────────────────────────────────────────

@ArgsType()
export class DashboardArgs {
  @Field({
    nullable: true,
    description: 'YYYY-MM-DD — sets reference month for all sections',
  })
  @IsOptional()
  @IsDateString()
  selectedDate?: string;

  // ✅ period for locationChart inside full dashboard
  @Field({
    nullable: true,
    description: 'week | month — controls locationChart range. Default: week',
  })
  @IsOptional()
  @IsIn(['week', 'month'])
  period?: 'week' | 'month';

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

// ─── CalendarArgs ─────────────────────────────────────────────────────────────

@ArgsType()
export class CalendarArgs {
  @Field(() => Int, { description: 'Full year e.g. 2026' })
  @IsInt()
  year: number;

  @Field(() => Int, { description: '1–12' })
  @IsInt()
  month: number;
}

// ─── LocationChartArgs ────────────────────────────────────────────────────────

@ArgsType()
export class LocationChartArgs {
  @Field({ nullable: true, description: 'week | month — default: week' })
  @IsOptional()
  @IsIn(['week', 'month'])
  period?: 'week' | 'month';

  @Field({
    nullable: true,
    description: 'YYYY-MM-DD — reference point for the period',
  })
  @IsOptional()
  @IsDateString()
  selectedDate?: string;
}

// ─── AppointmentsArgs ─────────────────────────────────────────────────────────

@ArgsType()
export class AppointmentsArgs {
  // Filter by exact day — used by standalone appointmentsTable query
  @Field({ nullable: true, description: 'YYYY-MM-DD — filter by a single day' })
  @IsOptional()
  @IsDateString()
  date?: string;

  // ✅ Filter by whole month — used internally by doctorDashboard
  @Field({
    nullable: true,
    description: 'YYYY-MM-DD — filter all appointments in that month',
  })
  @IsOptional()
  @IsDateString()
  monthDate?: string;

  @Field({ nullable: true })
  @IsOptional()
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

// ─── StatsArgs ────────────────────────────────────────────────────────────────

@ArgsType()
export class StatsArgs {
  @Field({ nullable: true, description: 'YYYY-MM-DD — defaults to today' })
  @IsOptional()
  @IsDateString()
  selectedDate?: string;
}

// ─── GenderStatsArgs ──────────────────────────────────────────────────────────

@ArgsType()
export class GenderStatsArgs {
  @Field({ nullable: true, description: 'YYYY-MM-DD — defaults to today' })
  @IsOptional()
  @IsDateString()
  selectedDate?: string;
}
