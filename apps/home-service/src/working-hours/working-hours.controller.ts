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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { WorkingHoursService } from './working-hours.service';
import {
  AddWorkingHoursDto,
  WorkingHoursResponseDto,
} from './dto/add-working-hours.dto';
import {
  ConflictCheckResponseDto,
  UpdateWorkingHoursDto,
} from './dto/update-working-hours.dto';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { Roles } from '@app/common/decorator/role.decorator';
import { ParseMongoIdPipe } from '@app/common/pipes/parse-mongo-id.pipe';

// import { JwtAuthGuard } from '../guards/jwt-auth.guard'; // Uncomment if you have auth

@ApiTags('Doctor Working Hours')
@Controller('doctors-working-hours')
export class WorkingHoursController {
  constructor(private readonly workingHoursService: WorkingHoursService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post(':doctorId/working-hours')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add working hours to a doctor',
    description:
      'Add working hours and inspection duration to a doctor. If this is the first time adding working hours, ' +
      'it will automatically trigger slot generation in the booking service via Kafka events. ' +
      'The slots will be created based on the working hours and inspection duration provided.',
  })
  @ApiParam({
    name: 'doctorId',
    description: 'MongoDB ObjectId of the doctor',
    example: '507f1f77bcf86cd799439011',
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
  @Get(':doctorId/working-hours')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get doctor's working hours",
    description:
      'Retrieve the working hours and inspection details for a specific doctor. ' +
      'This endpoint returns cached data when available for better performance.',
  })
  @ApiParam({
    name: 'doctorId',
    description: 'MongoDB ObjectId of the doctor',
    example: '507f1f77bcf86cd799439011',
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
  @Post(':doctorId/check-conflicts')
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
  @Post(':doctorId/update-working-hours')
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
}
