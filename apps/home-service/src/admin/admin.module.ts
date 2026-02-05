import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { DatabaseModule } from '@app/common/database/database.module';
import { JwtStrategy } from '@app/common/strategies/jwt.strategie';
import { JwtService } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [AdminService, JwtService, JwtStrategy],
  controllers: [AdminController],
})
export class AdminModule {}
