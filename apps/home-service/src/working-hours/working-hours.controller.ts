import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpStatus,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { WorkingHoursService } from './working-hours.service';
import {
  AddWorkingHoursDto,
  WorkingHoursResponseDto,
} from './dto/add-working-hours.dto';

// import { JwtAuthGuard } from '../guards/jwt-auth.guard'; // Uncomment if you have auth

@ApiTags('Doctor Working Hours')
@Controller('doctors-working-hours')
// @UseGuards(JwtAuthGuard) // Uncomment when auth is ready
// @ApiBearerAuth() // Uncomment when auth is ready
export class WorkingHoursController {
  constructor(private readonly workingHoursService: WorkingHoursService) {}

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
    @Param('doctorId') doctorId: string,
    @Body() addWorkingHoursDto: AddWorkingHoursDto,
  ): Promise<WorkingHoursResponseDto> {
    return this.workingHoursService.addWorkingHours(
      doctorId,
      addWorkingHoursDto,
    );
  }

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
  async getWorkingHours(@Param('doctorId') doctorId: string) {
    return this.workingHoursService.getWorkingHours(doctorId);
  }
}
