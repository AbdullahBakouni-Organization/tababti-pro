import {
  Controller,
  Post,
  Get,
  Body,
  HttpStatus,
  UseGuards,
  HttpCode,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { WorkingHoursService } from './working-hours.service';
import {
  AddWorkingHoursDto,
  WorkingHoursResponseDto,
} from './dto/add-working-hours.dto';
import {
  ConflictCheckResponseDto,
  UpdateWorkingHoursDto,
} from './dto/update-working-hours.dto';
import {
  CheckDeleteConflictDto,
  CheckDeleteConflictResponseDto,
  DeleteWorkingHoursDto,
} from './dto/delete-working-hours.dto';
import {
  CheckInspectionDurationConflictDto,
  CheckInspectionDurationConflictResponseDto,
  UpdateInspectionDurationDto,
} from './dto/update-inspection-duration.dto';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { Roles } from '@app/common/decorator/role.decorator';
import { ParseMongoIdPipe } from '@app/common/pipes/parse-mongo-id.pipe';

@ApiTags('Doctor Working Hours')
@Controller('doctors-working-hours')
export class WorkingHoursController {
  constructor(private readonly workingHoursService: WorkingHoursService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('add-working-hours')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add working hours to a doctor',
    description:
      'Add working hours and inspection duration to a doctor. If this is the first time adding working hours, ' +
      'it will automatically trigger slot generation in the booking service via Kafka events. ' +
      'The slots will be created based on the working hours and inspection duration provided.',
  })
  @ApiBody({
    type: AddWorkingHoursDto,
    description: 'Working hours and inspection details',
    examples: {
      example1: {
        summary: 'Single day, single location',
        value: {
          workingHours: [
            {
              day: 'monday',
              location: {
                type: 'clinic',
                entity_name: 'City Medical Clinic',
                address: '123 Main St, Downtown',
              },
              startTime: '09:00',
              endTime: '17:00',
            },
          ],
          inspectionDuration: 30,
          inspectionPrice: 50.0,
        },
      },
      example2: {
        summary: 'Multiple days, multiple locations',
        value: {
          workingHours: [
            {
              day: 'monday',
              location: {
                type: 'clinic',
                entity_name: 'City Medical Clinic',
                address: '123 Main St, Downtown',
              },
              startTime: '09:00',
              endTime: '13:00',
            },
            {
              day: 'monday',
              location: {
                type: 'hospital',
                entity_name: 'General Hospital',
                address: '456 Hospital Ave',
              },
              startTime: '14:00',
              endTime: '18:00',
            },
            {
              day: 'wednesday',
              location: {
                type: 'clinic',
                entity_name: 'City Medical Clinic',
                address: '123 Main St, Downtown',
              },
              startTime: '09:00',
              endTime: '17:00',
            },
            {
              day: 'friday',
              location: {
                type: 'center',
                entity_name: 'Medical Center North',
                address: '789 North Rd',
              },
              startTime: '10:00',
              endTime: '16:00',
            },
          ],
          inspectionDuration: 45,
          inspectionPrice: 75.0,
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description:
      'Working hours added successfully and slots generation initiated',
    type: WorkingHoursResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data or overlapping working hours',
    schema: {
      example: {
        statusCode: 400,
        message:
          'Overlapping working hours detected for monday at City Medical Clinic',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Doctor not found',
    schema: {
      example: {
        statusCode: 404,
        message: 'Doctor with ID 507f1f77bcf86cd799439011 not found',
        error: 'Not Found',
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Invalid or missing token',
  })
  async addWorkingHours(
    @Body() addWorkingHoursDto: AddWorkingHoursDto,
    @Req() req: any,
  ): Promise<WorkingHoursResponseDto> {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.workingHoursService.addWorkingHours(
      doctorId,
      addWorkingHoursDto,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Get('working-hours')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get doctor's working hours",
    description:
      'Retrieve the working hours and inspection details for a specific doctor. ' +
      'This endpoint returns cached data when available for better performance.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Working hours retrieved successfully',
    schema: {
      example: {
        doctorId: '507f1f77bcf86cd799439011',
        workingHours: [
          {
            day: 'monday',
            location: {
              type: 'clinic',
              entity_name: 'City Medical Clinic',
              address: '123 Main St, Downtown',
            },
            startTime: '09:00',
            endTime: '17:00',
          },
        ],
        inspectionDuration: 30,
        inspectionPrice: 50.0,
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid doctor ID format',
    schema: {
      example: {
        statusCode: 400,
        message: 'Invalid doctor ID',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Doctor not found',
    schema: {
      example: {
        statusCode: 404,
        message: 'Doctor with ID 507f1f77bcf86cd799439011 not found',
        error: 'Not Found',
      },
    },
  })
  async getWorkingHours(@Req() req: any) {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.workingHoursService.getWorkingHours(doctorId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Get('processing-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Poll Phase 2 background processing status',
    description:
      'Returns whether the Phase 2 background backfill for this doctor is still running. ' +
      'Phase 2 jobs are enqueued by the booking-service after any working-hours or ' +
      'inspection-duration change (add/update/delete/inspection) to rebuild weeks 2-48 ' +
      'of the appointment slot grid. The frontend should poll this endpoint every 5 ' +
      'seconds while the UI is waiting on the backfill to complete. The response shape ' +
      'is pinned — do not rely on any additional fields.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Phase 2 status retrieved',
    schema: {
      oneOf: [
        {
          example: {
            phase2Running: true,
            operation: 'update',
            startedAt: '2026-04-22T06:11:52.000Z',
          },
        },
        {
          example: {
            phase2Running: false,
            operation: null,
            startedAt: null,
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Invalid or missing token',
  })
  async getProcessingStatus(@Req() req: any): Promise<{
    phase2Running: boolean;
    operation: 'create' | 'update' | 'delete' | 'inspection' | null;
    startedAt: string | null;
  }> {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.workingHoursService.getPhase2ProcessingStatus(doctorId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('check-conflicts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check for conflicts before updating working hours (Dry Run)',
    description:
      'Analyzes the impact of new working hours on existing bookings without making any changes. Returns a list of bookings that would be cancelled.',
  })
  @ApiResponse({
    status: 200,
    description: 'Conflict check completed',
    type: ConflictCheckResponseDto,
  })
  async checkConflicts(
    @Body() updateDto: UpdateWorkingHoursDto,
    @Req() req: any,
  ): Promise<ConflictCheckResponseDto> {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.workingHoursService.checkWorkingHoursConflicts(
      doctorId,
      updateDto,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('update-working-hours')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update working hours (Confirmed)',
    description:
      'Updates the doctor working hours and queues jobs to handle any conflicts. Requires confirmUpdate: true if conflicts exist.',
  })
  @ApiResponse({
    status: 200,
    description: 'Working hours updated successfully',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflicts exist but not confirmed',
  })
  async updateWorkingHours(
    @Body() updateDto: UpdateWorkingHoursDto,
    @Req() req: any,
  ) {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.workingHoursService.updateWorkingHours(doctorId, updateDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('check-delete-conflict')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Check bookings that will be cancelled if a working-hours entry is deleted (Dry Run)',
    description:
      'Read-only check. The body must exactly match one entry of the doctor workingHours array.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conflict check completed',
    type: CheckDeleteConflictResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No matching working-hours entry found',
  })
  async checkDeleteConflict(
    @Body() dto: CheckDeleteConflictDto,
    @Req() req: any,
  ): Promise<CheckDeleteConflictResponseDto> {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.workingHoursService.checkDeleteConflict(doctorId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a working-hours entry (Confirmed)',
    description:
      'Removes the entry from the doctor schema and queues async cleanup of related slots, bookings and patient notifications. Requires confirm: true.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Deletion accepted and cleanup queued',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'confirm flag missing or not true',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No matching working-hours entry found',
  })
  async deleteWorkingHours(
    @Body() dto: DeleteWorkingHoursDto,
    @Req() req: any,
  ) {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.workingHoursService.deleteWorkingHours(doctorId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('check-inspection-duration-conflict')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Check bookings that will be cancelled if inspection duration changes (Dry Run)',
    description:
      'Read-only. If the duration equals the current one, no conflicts are returned — price-only updates are non-destructive.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conflict check completed',
    type: CheckInspectionDurationConflictResponseDto,
  })
  async checkInspectionDurationConflict(
    @Body() dto: CheckInspectionDurationConflictDto,
    @Req() req: any,
  ): Promise<CheckInspectionDurationConflictResponseDto> {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.workingHoursService.checkInspectionDurationConflict(
      doctorId,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('update-inspection-duration')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update inspection duration and/or price (Confirmed)',
    description:
      'Updates doctor.inspectionDuration and/or doctor.inspectionPrice. If duration changes, all future slots are invalidated, active bookings are cancelled, patients are notified (FCM for app users, WhatsApp for manual patients), and the slot grid is regenerated. Price-only updates skip regeneration. Requires confirm: true.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Update accepted' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'confirm flag missing or doctor has no working hours',
  })
  async updateInspectionDuration(
    @Body() dto: UpdateInspectionDurationDto,
    @Req() req: any,
  ) {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.workingHoursService.updateInspectionDuration(doctorId, dto);
  }
}
