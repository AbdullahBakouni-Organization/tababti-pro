// auth.controller.ts
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Res,
  UseInterceptors,
  UploadedFile,
  Req,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  RequestOtpDto,
  VerifyOtpDto,
  AuthResponseDto,
  ResendOtpDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { User } from '@app/common/database/schemas/user.schema';
import type { Response } from 'express';

import { userImageOptions } from '@app/common/helpers/file-upload.helper';
import { RolesGuard } from '@app/common/guards/role.guard';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { Roles } from '@app/common/decorator/role.decorator';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';

import type { Request } from 'express';
import { JwtUserGuard } from '@app/common/guards/jwt-user.guard';
import { DocumentUrlInterceptor } from '@app/common/interceptors';
import { AuthValidateService } from '@app/common/auth-validate';
import { JwtUserRefreshGuard } from '@app/common/guards/jwt-refresh-user.guard';
import { ParseMongoIdPipe } from '@app/common/pipes/parse-mongo-id.pipe';
import multer from 'multer';
export interface RequestWithUser extends Request {
  user: User;
}
// Memory storage config for MinIO
const memoryStorageConfig = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req: any, file: Express.Multer.File, cb: any) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(
          new BadRequestException(
            'Invalid file type. Allowed: JPEG, PNG, WEBP',
          ),
          false,
        );
  },
};
@ApiTags('Authentication')
@Controller('auth-service')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private authValidateService: AuthValidateService,
  ) {}
  @Throttle({ default: { limit: 3, ttl: 60 } })
  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request OTP for Sign-in or Sign-up',
    description:
      'Send OTP to phone number. For new users, all user fields (username, gender, city, DataofBirth) are required. For existing users, only phone and role are needed.',
  })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Missing required fields for new users',
  })
  async requestOtp(
    @Body() requestOtpDto: RequestOtpDto,
  ): Promise<AuthResponseDto> {
    return await this.authService.requestOtp(requestOtpDto);
  }

  @Throttle({ default: { limit: 5, ttl: 300 } })
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify OTP',
    description: 'Verify the OTP code sent to the phone number',
  })
  @ApiResponse({
    status: 200,
    description: 'OTP verified successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired OTP',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid OTP code',
  })
  async verifyOtp(
    @Body() verifyOtpDto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return await this.authService.verifyOtp(verifyOtpDto, res);
  }
  @Throttle({ default: { limit: 2, ttl: 120 } })
  @Post('resend-otp')
  @ApiOperation({ summary: 'Resend OTP code' })
  @ApiResponse({
    status: 200,
    description: 'OTP resent successfully',
    schema: {
      example: {
        message: 'New OTP sent successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'User already verified' })
  @ApiResponse({ status: 404, description: 'No pending registration found' })
  async resendOtp(@Body() resendOtpDto: ResendOtpDto) {
    return this.authService.resendOtp(resendOtpDto);
  }

  @UseGuards(JwtUserGuard, RolesGuard)
  @Roles(UserRole.USER)
  @Post('complete-registration')
  @UseInterceptors(
    FileInterceptor('image', userImageOptions),
    DocumentUrlInterceptor,
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Step 3: Complete registration with user details' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', example: '+1234567890' },
        username: { type: 'string', example: 'john_doe' },
        password: { type: 'string', example: 'SecurePass123!' },
        city: { type: 'string', example: 'New York' },
        gender: { type: 'string', example: 'Male' },
        age: { type: 'number', example: 25 },
        image: { type: 'string', format: 'binary' },
      },
      required: ['phone', 'username', 'password', 'city', 'gender', 'age'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Registration completed successfully',
    schema: {
      example: {
        message: 'Registration completed successfully',
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          id: 'user-uuid',
          username: 'john_doe',
          phone: '+1234567890',
          city: 'New York',
          gender: 'Male',
          age: 25,
          imageUrl: 'http://localhost:3000/uploads/image.jpg',
          isVerified: true,
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Phone verification not found' })
  @ApiResponse({ status: 409, description: 'Username already exists' })
  async completeRegistration(
    @Body() completeRegistrationDto: RequestOtpDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.authService.completeRegistration(completeRegistrationDto, file);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  logout(@Req() req: any) {
    const patientId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.authService.logout(patientId);
  }

  @Post('refresh')
  @UseGuards(JwtUserRefreshGuard, RolesGuard)
  @Roles(UserRole.USER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refreshToken(
    @Body('refreshToken') refreshToken: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{
    success: boolean;
    accessToken: string;
    refreshToken?: string;
  }> {
    const tokens =
      await this.authValidateService.refreshUserAccessToken(refreshToken);
    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }
}
