import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthValidateService } from './auth-validate.service';
import { DatabaseModule } from '../database/database.module';
import {
  JwtRefreshAdminStrategy,
  JwtRefreshStrategy,
  JwtStrategy,
  JwtUserRefreshStrategy,
  JwtUserStrategy,
} from '../strategies/jwt.strategie';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: '5h' },
      }),
      inject: [ConfigService],
    }),
    DatabaseModule,
  ],
  providers: [
    AuthValidateService,
    JwtRefreshStrategy,
    JwtStrategy,
    JwtUserStrategy,
    JwtUserRefreshStrategy,
    JwtRefreshAdminStrategy,
  ],
  exports: [
    AuthValidateService,
    JwtRefreshStrategy,
    JwtStrategy,
    JwtUserStrategy,
    JwtUserRefreshStrategy,
    JwtRefreshAdminStrategy,
  ],
})
export class AuthValidateModule {}
