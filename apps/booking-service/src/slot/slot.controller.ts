import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { SlotGenerationService } from './slot.service';
import {
  AvailableSlotDto,
  GetAvailableSlotsDto,
  GroupedAvailableSlotsDto,
} from './dto/get-avalible-slot.dto';
import { JwtUserGuard } from '@app/common/guards/jwt-user.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';

@ApiTags('Slot Management')
@Controller('slots')
export class SlotController {
  constructor(private readonly slotManagementService: SlotGenerationService) {}

  /* -------------------------------------------------------------------------- */
  /*                   PATIENT-FACING: GET AVAILABLE SLOTS                      */
  /* -------------------------------------------------------------------------- */

  /**
   * Get available slots for booking
   * This is the main route patients use to see bookable appointments
   */

  @UseGuards(JwtUserGuard, RolesGuard)
  @Roles(UserRole.USER)
  @Get('available')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get available appointment slots',
    description:
      'Retrieve all available (bookable) slots for a doctor. Patients use this to see open appointments. Results are cached for 5 minutes.',
  })
  @ApiQuery({
    name: 'doctorId',
    required: true,
    description: 'Doctor ID',
    example: '507f1f77bcf86cd799439010',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date (YYYY-MM-DD). Defaults to today.',
    example: '2026-02-15',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date (YYYY-MM-DD). Defaults to 30 days from start.',
    example: '2026-03-15',
  })
  @ApiQuery({
    name: 'location',
    required: false,
    description: 'Filter by location name',
    example: 'City Medical Center',
  })
  @ApiResponse({
    status: 200,
    description: 'Available slots retrieved successfully',
    type: [AvailableSlotDto],
  })
  @ApiResponse({
    status: 404,
    description: 'Doctor not found',
  })
  async getAvailableSlots(
    @Query() query: GetAvailableSlotsDto,
  ): Promise<GroupedAvailableSlotsDto> {
    return this.slotManagementService.getAvailableSlots(query);
  }
}
