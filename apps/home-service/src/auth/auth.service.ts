import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { AuthAccount } from '@app/common/database/schemas/auth.schema';
import { Otp } from '@app/common/database/schemas/otp.schema';
import { User } from '@app/common/database/schemas/user.schema';
import { SmsService } from '../sms/sms.service';
import { RequestOtpDto, ResendOtpDto, VerifyOtpDto } from './dto/auth.dto';
import { Gender, UserRole } from '@app/common/database/schemas/common.enums';
import { Response } from 'express';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Hospital } from '@app/common/database/schemas/hospital.schema';
import { Center } from '@app/common/database/schemas/center.schema';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(AuthAccount.name) private authModel: Model<AuthAccount>,
    @InjectModel(Otp.name) private otpModel: Model<Otp>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Doctor.name) private doctorModel: Model<Doctor>,
    @InjectModel(Hospital.name) private hospitalModel: Model<Hospital>,
    @InjectModel(Center.name) private centerModel: Model<Center>,
    @InjectConnection() private readonly connection: Connection,
    private readonly smsService: SmsService,
    private readonly jwtService: JwtService,
    private readonly whatsappService: WhatsappService,
  ) {}

  //---------------------------------------------------------
  // TOKEN BUILDER
  //---------------------------------------------------------
  private buildToken(account: AuthAccount) {
    return this.jwtService.sign(
      {
        sub: account._id.toString(),
        role: account.role,
        tv: account.tokenVersion,
      },
      {
        secret: process.env.JWT_SECRET,
        expiresIn: '7d',
      },
    );
  }

  //---------------------------------------------------------
  // REQUEST OTP
  //---------------------------------------------------------
  async requestOtp(dto: RequestOtpDto) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const { phone } = dto;

      // find or create auth account
      let authAccount = await this.authModel
        .findOne({ phones: phone })
        .session(session);

      if (!authAccount) {
        const [created] = await this.authModel.create(
          [
            {
              phones: [phone],
              role: UserRole.USER,
              isActive: false,
            },
          ],
          { session },
        );

        authAccount = created;
      }

      // clear existing otp
      await this.otpModel
        .deleteMany({ authAccountId: authAccount?._id })
        .session(session);

      // generate otp
      const otp = this.smsService.generateOTP();

      await this.otpModel.create(
        [
          {
            authAccountId: authAccount?._id,
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

      //await this.smsService.sendOTP(phone, otp);
      await this.whatsappService.sendOtp(phone, otp); //test whatsapp-web api
      return {
        success: true,
        message: 'OTP sent',
      };
    } catch (err) {
      await session.abortTransaction();
      await session.endSession();
      throw err;
    }
  }

  //---------------------------------------------------------
  // VERIFY OTP (SIGN-IN + AUTO-REGISTER USER)
  //---------------------------------------------------------

  async verifyOtp(dto: VerifyOtpDto, res: Response) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const { phone, code } = dto;

      const authAccount = await this.authModel
        .findOne({ phones: phone })
        .session(session);
      if (!authAccount) throw new NotFoundException('Auth account not found');

      const otp = await this.otpModel
        .findOne({
          authAccountId: authAccount._id,
          phone,
        })
        .sort({ createdAt: -1 })
        .session(session);

      if (!otp) throw new BadRequestException('OTP not found');

      if (otp.isUsed) throw new BadRequestException('OTP already used');

      if (otp.attempts >= 3) {
        throw new BadRequestException(
          'Maximum OTP attempts exceeded. Please request a new OTP.',
        );
      }
      if (new Date() > otp.expiresAt)
        throw new BadRequestException('OTP expired');
      if (otp.code !== code) {
        otp.attempts += 1;
        await otp.save({ session });
        throw new UnauthorizedException('Incorrect OTP');
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

      const token = this.buildToken(authAccount);
      // res.setHeader('x-access-token', token);

      if (authAccount.role === 'user' && !entityExists) {
        return {
          success: true,
          message: 'OTP verified - Profile completion required',
          token,
          role: authAccount.role,
          needsCompletion: true,
        };
      }
      if (!entityExists) {
        throw new BadRequestException(
          `${authAccount.role} profile not found. Please contact administrator.`,
        );
      }
      return {
        success: true,
        message: 'Sign in successful',
        role: authAccount.role,
        token,
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
    imagePath?: string,
  ): Promise<any> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const { phone, username, gender, city, DataofBirth } = dto;

      // Validate required fields first
      if (!phone || !username || !gender || !city || !DataofBirth) {
        throw new BadRequestException('Missing required fields');
      }

      const authAccount = await this.authModel
        .findOne({ phones: phone })
        .session(session);
      if (!authAccount) throw new NotFoundException('AuthAccount not found');

      const existingUser = await this.userModel
        .findOne({ authAccountId: authAccount._id })
        .session(session);

      if (existingUser) {
        throw new BadRequestException('User profile already completed');
      }

      // Create new user
      const [user] = await this.userModel.create(
        [
          {
            authAccountId: authAccount._id,
            phone,
            username,
            gender: gender || Gender.MALE,
            city: city,
            DataofBirth,
            image: imagePath || '',
            status: 'active',
          },
        ],
        { session },
      );

      await session.commitTransaction();
      const plainUser = user.toObject();

      return {
        success: true,
        message: 'Registration completed',
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

  async resendOtp(dto: ResendOtpDto) {
    const session = await this.connection.startSession();
    session.startTransaction();
    const { phone } = dto;
    try {
      const authAccount = await this.authModel
        .findOne({ phones: phone })
        .session(session);

      if (!authAccount) {
        throw new NotFoundException('Auth account not found for this phone');
      }

      // delete previous OTPs
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
            attempts: 0, // reset attempts
          },
        ],
        { session },
      );

      await session.commitTransaction();
      await session.endSession();

      await this.smsService.sendOTP(phone, otp);

      return {
        success: true,
        message: 'OTP resent successfully',
      };
    } catch (error) {
      await session.abortTransaction();
      await session.endSession();
      throw error;
    }
  }

  async validateUser(userId: string) {
    // 1) load auth account (contains role)
    const account = await this.authModel
      .findById(userId)
      .select('role')
      .lean()
      .exec();

    if (!account) return null;

    // 2) load user profile data (optional, if you need it)
    const user = await this.userModel
      .findOne({ authAccountId: new Types.ObjectId(userId) })
      .select('username phone city gender DataofBirth image')
      .lean()
      .exec();

    return {
      id: userId,
      role: account.role, // IMPORTANT ✔
      username: user?.username,
      phone: user?.phone,
      city: user?.city,
      gender: user?.gender,
      dateOfBirth: user?.DataofBirth,
      image: user?.image,
    };
  }
  async logout(userId: string) {
    await this.authModel.findByIdAndUpdate(userId, {
      $inc: { tokenVersion: 1 },
    });

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  async getAccount(userId: string) {
    const account = await this.authModel
      .findById(userId)
      .select('tokenVersion')
      .lean()
      .exec();

    if (!account) return null;

    return account;
  }
}
