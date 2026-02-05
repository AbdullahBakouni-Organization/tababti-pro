import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Admin } from '@app/common/database/schemas/admin.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Hospital } from '@app/common/database/schemas/hospital.schema';
import { Center } from '@app/common/database/schemas/center.schema';
import { AuthAccount } from '@app/common/database/schemas/auth.schema';
import { UserRole } from '@app/common/database/schemas/common.enums';

import { AdminSignInDto } from './dto/admin-signin.dto';
import { Response } from 'express';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Admin.name) private adminModel: Model<Admin>,
    @InjectModel(Doctor.name) private doctorModel: Model<Doctor>,
    @InjectModel(Hospital.name) private hospitalModel: Model<Hospital>,
    @InjectModel(Center.name) private centerModel: Model<Center>,
    @InjectModel(AuthAccount.name) private authAccountModel: Model<AuthAccount>,
    private jwtService: JwtService,
  ) {}

  // Admin Sign In
  async signIn(dto: AdminSignInDto, res: Response) {
    const admin = await this.adminModel.findOne({
      username: dto.username,
      phone: dto.phone,
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, admin.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Admin account is deactivated');
    }
    await this.authAccountModel.findByIdAndUpdate(admin.authAccountId, {
      lastLoginAt: new Date(),
    });
    const payload = {
      sub: admin.authAccountId.toString(),
      role: UserRole.ADMIN,
    };
    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: '7d',
    });
    // const token = this.buildToken(authAccount);
    res.setHeader('x-access-token', accessToken);
    return {
      accessToken,
      admin: {
        id: admin._id,
        username: admin.username,
      },
    };
  }
}
