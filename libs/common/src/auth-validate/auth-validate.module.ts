import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthValidateService } from './auth-validate.service';
import { DatabaseModule } from '../database/database.module';
import { JwtRefreshStrategy, JwtStrategy } from '../strategies/jwt.strategie';

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
    DatabaseModule,
  ],
  providers: [
    AuthValidateService,
    JwtService,
    JwtModule,
    JwtRefreshStrategy,
    JwtStrategy,
  ],
  exports: [AuthValidateService, JwtService, JwtRefreshStrategy, JwtStrategy],
})
export class AuthValidateModule {}
