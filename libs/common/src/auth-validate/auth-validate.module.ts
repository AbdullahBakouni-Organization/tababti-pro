import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthValidateService } from './auth-validate.service';
import { Doctor, DoctorSchema } from '../database/schemas/doctor.schema';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([{ name: Doctor.name, schema: DoctorSchema }]),
  ],
  providers: [AuthValidateService],
  exports: [AuthValidateService, JwtModule],
})
export class AuthValidateModule {}
