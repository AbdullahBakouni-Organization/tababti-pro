import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { AuthAccount } from '@app/common/database/schemas/auth.schema';
import { Otp, OtpDocument } from '@app/common/database/schemas/otp.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { User } from '@app/common/database/schemas/user.schema';
import { SmsService } from '../sms/sms.service';
import { RequestOtpDto, ResendOtpDto, VerifyOtpDto } from './dto/auth.dto';
import {
  ApprovalStatus,
  Gender,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import type { Response } from 'express';
import { AuthValidateService } from '@app/common/auth-validate';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import { MinioService, UploadResult } from '../minio/minio.service';
import { ApiResponse } from '@app/common/response/api-response';

type Lang = 'en' | 'ar';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(AuthAccount.name) private authModel: Model<AuthAccount>,
    @InjectModel(Otp.name) private otpModel: Model<OtpDocument>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectConnection() private readonly connection: Connection,
    private readonly smsService: SmsService,
    private readonly kafkaProducer: KafkaService,
    private authService: AuthValidateService,
  ) {}

  //---------------------------------------------------------
  // REQUEST OTP
  //---------------------------------------------------------
  async requestOtp(dto: RequestOtpDto, lang: Lang = 'en') {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const { phone } = dto;

      console.log(`📨 [requestOtp] Received OTP request for phone: ${phone}`);

      let authAccount = await this.authModel
        .findOne({ phones: phone })
        .session(session);

      if (!authAccount) {
        console.log(
          `🆕 [requestOtp] No auth account found — creating new one for: ${phone}`,
        );
        const [created] = await this.authModel.create(
          [{ phones: [phone], role: UserRole.USER, isActive: false }],
          { session },
        );
        authAccount = created;
        console.log(`✅ [requestOtp] Auth account created: ${authAccount._id}`);
      } else {
        console.log(
          `🔍 [requestOtp] Existing auth account found: ${authAccount._id}`,
        );
      }

      console.log(
        `🗑️  [requestOtp] Deleting previous OTPs for account: ${authAccount._id}`,
      );
      await this.otpModel
        .deleteMany({ authAccountId: authAccount._id })
        .session(session);

      const otp = this.smsService.generateOTP();
      console.log(`🔐 [requestOtp] Generated OTP: ${otp} for phone: ${phone}`);

      await this.otpModel.create(
        [
          {
            authAccountId: authAccount._id,
            phone,
            code: otp,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            isUsed: false,
            attempts: 0,
          },
        ],
        { session },
      );
      console.log(`💾 [requestOtp] OTP saved to DB, expires in 10 minutes`);

      await session.commitTransaction();
      console.log(`✅ [requestOtp] Transaction committed`);

      console.log(
        `📡 [requestOtp] Emitting Kafka event: ${KAFKA_TOPICS.WHATSAPP_SEND_OTP}`,
      );

      await Promise.allSettled([
        //this.smsService.sendOTP(phone, otp),
        this.kafkaProducer.emit(KAFKA_TOPICS.WHATSAPP_SEND_OTP, {
          phone,
          otp,
          lang: dto.lang ?? 'ar',
        }),
      ]);

      console.log(
        `🎉 [requestOtp] OTP flow completed successfully for: ${phone}`,
      );

      return {
        success: true,
        message: ApiResponse.getMessage(lang, 'auth.OTP_SENT'),
      };
    } catch (err) {
      console.error(
        `❌ [requestOtp] Error for phone ${dto.phone}:`,
        err.message,
      );
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }
  }

  //---------------------------------------------------------
  // VERIFY OTP (SIGN-IN + AUTO-REGISTER USER)
  //---------------------------------------------------------
  async verifyOtp(dto: VerifyOtpDto, res: Response, lang: Lang = 'en') {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const { phone, code } = dto;

      const authAccount = await this.authModel
        .findOne({ phones: phone })
        .session(session);
      if (!authAccount) throw new NotFoundException('auth.AUTH_NOT_FOUND');

      const otp = await this.otpModel
        .findOne({
          authAccountId: authAccount._id,
          phone,
        })
        .sort({ createdAt: -1 })
        .session(session);

      if (!otp) throw new BadRequestException('auth.OTP_NOT_FOUND');

      if (otp.isUsed) throw new BadRequestException('auth.OTP_ALREADY_USED');

      if (otp.isExpired()) {
        throw new UnauthorizedException('auth.OTP_EXPIRED');
      }

      if (otp.isMaxAttemptsReached()) {
        throw new UnauthorizedException('auth.OTP_MAX_ATTEMPTS');
      }

      if (otp.code !== code) {
        otp.incrementAttempts();
        await otp.save({ session });
        await session.commitTransaction();
        throw new UnauthorizedException('auth.OTP_INVALID');
      }

      otp.isUsed = true;
      await otp.save({ session });

      authAccount.isActive = true;
      authAccount.lastLoginAt = new Date();
      await authAccount.save({ session });

      let entityExists = false;
      let entityData: any = null;
      if (authAccount) {
        entityData = await this.userModel
          .findOne({ authAccountId: authAccount._id })
          .session(session);
        entityExists = !!entityData;
      }

      await session.commitTransaction();

      if (authAccount.role === 'user' && !entityExists) {
        const tokens = await this.authService.generateTokenUserPair(
          authAccount._id.toString(),
          authAccount.phones[0],
          authAccount.role,
          authAccount.tokenVersion,
        );
        return {
          success: true,
          message: ApiResponse.getMessage(
            lang,
            'auth.OTP_VERIFIED_NEEDS_COMPLETION',
          ),
          role: authAccount.role,
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          needsCompletion: true,
        };
      }

      if (!entityExists) {
        throw new BadRequestException('auth.PROFILE_NOT_FOUND_FOR_ROLE');
      }

      const tokens = await this.authService.generateTokenUserPair(
        authAccount._id.toString(),
        authAccount.phones[0],
        authAccount.role,
        authAccount.tokenVersion,
      );

      return {
        success: true,
        message: ApiResponse.getMessage(lang, 'auth.OTP_VERIFIED'),
        role: authAccount.role,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        needsCompletion: false,
        entityId: entityData._id,
      };
    } catch (err) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }

  //---------------------------------------------------------
  // COMPLETE REGISTRATION FOR USER ONLY
  //---------------------------------------------------------
  async completeRegistration(
    dto: RequestOtpDto,
    lang: Lang = 'en',
  ): Promise<any> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const { phone, username, gender, city, DataofBirth } = dto;

      if (!phone || !username || !gender || !city || !DataofBirth) {
        throw new BadRequestException('auth.REGISTRATION_MISSING_FIELDS');
      }

      const authAccount = await this.authModel
        .findOne({ phones: phone })
        .session(session);
      if (!authAccount) throw new NotFoundException('auth.AUTH_NOT_FOUND');

      const existingUser = await this.userModel
        .findOne({ authAccountId: authAccount._id })
        .session(session);

      if (existingUser) {
        throw new BadRequestException('auth.REGISTRATION_ALREADY_COMPLETED');
      }

      const [user] = await this.userModel.create(
        [
          {
            authAccountId: authAccount._id,
            phone,
            username,
            gender: gender || Gender.MALE,
            city,
            DataofBirth,
            image: imagePath || '',
            status: ApprovalStatus.ACTIVE,
          },
        ],
        { session },
      );

      await session.commitTransaction();
      const plainUser = user.toObject();

      return {
        success: true,
        message: ApiResponse.getMessage(lang, 'auth.REGISTRATION_COMPLETED'),
        user: {
          ...plainUser,
          _id: plainUser._id.toString(),
          authAccountId: plainUser.authAccountId.toString(),
          DataofBirth: plainUser.DataofBirth?.toISOString(),
        },
      };
    } catch (err) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }

  //---------------------------------------------------------
  // RESEND OTP
  //---------------------------------------------------------
  async resendOtp(dto: ResendOtpDto, lang: Lang = 'en') {
    const session = await this.connection.startSession();
    session.startTransaction();
    const { phone } = dto;

    try {
      const authAccount = await this.authModel
        .findOne({ phones: phone })
        .session(session);

      if (!authAccount) {
        throw new NotFoundException('auth.AUTH_NOT_FOUND');
      }

      await this.otpModel
        .deleteMany({ authAccountId: authAccount._id })
        .session(session);

      const otp = this.smsService.generateOTP();

      await this.otpModel.create(
        [
          {
            authAccountId: authAccount._id,
            phone,
            code: otp,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            isUsed: false,
            attempts: 0,
          },
        ],
        { session },
      );

      await session.commitTransaction();
      await session.endSession();

      await this.smsService.sendOTP(phone, otp);

      return {
        success: true,
        message: ApiResponse.getMessage(lang, 'auth.OTP_RESENT'),
      };
    } catch (error) {
      await session.abortTransaction();
      await session.endSession();
      throw error;
    }
  }

  //---------------------------------------------------------
  // LOGOUT
  //---------------------------------------------------------
  async logout(userId: string, lang: Lang = 'en') {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('user.NOT_FOUND');
    }

    if (!user.authAccountId) {
      throw new BadRequestException('auth.AUTH_NOT_LINKED');
    }

    await this.authModel.findByIdAndUpdate(
      user.authAccountId,
      { $inc: { tokenVersion: 1 } },
      { new: true },
    );

    user.fcmToken = '';
    await user.save();

    return {
      success: true,
      message: ApiResponse.getMessage(lang, 'auth.LOGGED_OUT'),
    };
  }
}
