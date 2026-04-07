import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

import { AdminService } from './admin.service';
import { AdminCreateDoctorDto } from './dto/create-doctor.dto';
import { AdminUpdateDoctorDto } from './dto/update-doctor.dto';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { ParseMongoIdPipe } from '@app/common/pipes/parse-mongo-id.pipe';
import { memoryDocsStorageConfig } from '@app/common/constant/images-dtos.constant';

// Shared file fields for both create and update endpoints
const DOCTOR_FILE_FIELDS = [
  { name: 'profileImage', maxCount: 1 },
  { name: 'certificateImage', maxCount: 1 },
  { name: 'licenseImage', maxCount: 1 },
  { name: 'certificateDocument', maxCount: 1 },
  { name: 'licenseDocument', maxCount: 1 },
] as const;

// Swagger schema for the multipart body (shared base)
const DOCTOR_FILE_PROPERTIES = {
  profileImage: {
    type: 'string',
    format: 'binary',
    description: 'Profile photo (JPEG, PNG, WEBP — max 5 MB)',
  },
  certificateImage: {
    type: 'string',
    format: 'binary',
    description: 'Certificate as image (JPEG, PNG, WEBP — max 10 MB)',
  },
  licenseImage: {
    type: 'string',
    format: 'binary',
    description: 'License as image (JPEG, PNG, WEBP — max 10 MB)',
  },
  certificateDocument: {
    type: 'string',
    format: 'binary',
    description: 'Certificate as PDF (max 10 MB)',
  },
  licenseDocument: {
    type: 'string',
    format: 'binary',
    description: 'License as PDF (max 10 MB)',
  },
} as const;

@ApiTags('Admin - Doctor Management')
@Controller('admin/doctors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminDoctorController {
  constructor(private readonly adminService: AdminService) {}

  // ============================================================
  // POST /admin/doctors
  // ============================================================

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([...DOCTOR_FILE_FIELDS], memoryDocsStorageConfig),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create a new doctor',
    description: `Admin creates a doctor account directly.
The doctor status defaults to **APPROVED**.

**File rules:**
- \`profileImage\`, \`certificateImage\`, \`licenseImage\` — JPEG / PNG / WEBP, max 5–10 MB
- \`certificateDocument\`, \`licenseDocument\` — PDF only, max 10 MB

All files are stored in MinIO (object storage).`,
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'firstName',
        'middleName',
        'lastName',
        'password',
        'phone',
        'city',
        'subcity',
        'publicSpecialization',
        'privateSpecialization',
        'gender',
      ],
      properties: {
        firstName: { type: 'string', example: 'Ahmed' },
        middleName: { type: 'string', example: 'Mohammed' },
        lastName: { type: 'string', example: 'Al-Hassan' },
        password: { type: 'string', example: 'SecureP@ss123' },
        phone: { type: 'string', example: '+963991234567' },
        city: { type: 'string', example: 'دمشق' },
        subcity: { type: 'string', example: 'دمشق القديمة' },
        publicSpecialization: { type: 'string', example: 'human_medicine' },
        privateSpecialization: {
          type: 'string',
          example: 'general_practitioner',
        },
        gender: { type: 'string', enum: ['male', 'female'], example: 'male' },
        status: {
          type: 'string',
          enum: ['pending', 'approved', 'rejected', 'suspended'],
          example: 'approved',
        },
        latitude: { type: 'number', example: 33.51 },
        longitude: { type: 'number', example: 36.29 },
        bio: { type: 'string', example: 'Experienced general practitioner.' },
        address: { type: 'string', example: '5 Mazzeh Street' },
        yearsOfExperience: { type: 'number', example: 10 },
        inspectionDuration: { type: 'number', example: 30 },
        inspectionPrice: { type: 'number', example: 5000 },
        profileViews: {
          type: 'number',
          example: 0,
          description: 'Initial profile view count',
        },
        workingHours: {
          type: 'array',
          description: 'Weekly schedule entries',
          items: {
            type: 'object',
            required: ['day', 'location', 'startTime', 'endTime'],
            properties: {
              day: {
                type: 'string',
                enum: [
                  'sunday',
                  'monday',
                  'tuesday',
                  'wednesday',
                  'thursday',
                  'friday',
                  'saturday',
                ],
                example: 'monday',
              },
              location: {
                type: 'object',
                required: ['type', 'entity_name', 'address'],
                properties: {
                  type: {
                    type: 'string',
                    enum: ['clinic', 'hospital', 'center', 'pharmacy', 'other'],
                    example: 'clinic',
                  },
                  entity_name: { type: 'string', example: 'Al-Shifa Clinic' },
                  address: {
                    type: 'string',
                    example: '5 Mazzeh Street, Damascus',
                  },
                },
              },
              startTime: { type: 'string', example: '09:00' },
              endTime: { type: 'string', example: '17:00' },
            },
          },
        },
        ...DOCTOR_FILE_PROPERTIES,
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Doctor created successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Doctor created successfully' },
        doctorId: { type: 'string', example: '507f1f77bcf86cd799439011' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or invalid file type',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — admin token required',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict — phone number already registered',
  })
  async createDoctor(
    @Body() dto: AdminCreateDoctorDto,
    @UploadedFiles()
    files?: {
      profileImage?: Express.Multer.File[];
      certificateImage?: Express.Multer.File[];
      licenseImage?: Express.Multer.File[];
      certificateDocument?: Express.Multer.File[];
      licenseDocument?: Express.Multer.File[];
    },
  ) {
    return this.adminService.createDoctor(dto, files);
  }

  // ============================================================
  // PATCH /admin/doctors/:id
  // ============================================================

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileFieldsInterceptor([...DOCTOR_FILE_FIELDS], memoryDocsStorageConfig),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update an existing doctor',
    description: `Admin updates any field of a doctor profile.

All fields are **optional** — only the provided fields are updated.
Password changes are excluded; use a dedicated change-password endpoint.

Uploading a new file replaces the existing one in MinIO.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Doctor MongoDB ObjectId',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string', example: 'Ahmed' },
        middleName: { type: 'string', example: 'Mohammed' },
        lastName: { type: 'string', example: 'Al-Hassan' },
        phone: { type: 'string', example: '+963991234567' },
        city: { type: 'string', example: 'دمشق' },
        subcity: { type: 'string', example: 'دمشق القديمة' },
        publicSpecialization: { type: 'string', example: 'human_medicine' },
        privateSpecialization: {
          type: 'string',
          example: 'general_practitioner',
        },
        gender: { type: 'string', enum: ['male', 'female'], example: 'male' },
        status: {
          type: 'string',
          enum: ['pending', 'approved', 'rejected', 'suspended'],
          example: 'approved',
        },
        latitude: { type: 'number', example: 33.51 },
        longitude: { type: 'number', example: 36.29 },
        bio: { type: 'string', example: 'Experienced general practitioner.' },
        address: { type: 'string', example: '5 Mazzeh Street' },
        yearsOfExperience: { type: 'number', example: 10 },
        inspectionDuration: { type: 'number', example: 30 },
        inspectionPrice: { type: 'number', example: 5000 },
        profileViews: {
          type: 'number',
          example: 120,
          description: 'Override profile view count',
        },
        ...DOCTOR_FILE_PROPERTIES,
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Doctor updated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Doctor updated successfully' },
        doctorId: { type: 'string', example: '507f1f77bcf86cd799439011' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or invalid doctor ID',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — admin token required',
  })
  @ApiResponse({ status: 404, description: 'Doctor not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — phone number already registered',
  })
  async updateDoctor(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: AdminUpdateDoctorDto,
    @UploadedFiles()
    files?: {
      profileImage?: Express.Multer.File[];
      certificateImage?: Express.Multer.File[];
      licenseImage?: Express.Multer.File[];
      certificateDocument?: Express.Multer.File[];
      licenseDocument?: Express.Multer.File[];
    },
  ) {
    return this.adminService.updateDoctor(id, dto, files);
  }
}
