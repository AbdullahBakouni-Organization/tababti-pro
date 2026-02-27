import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DashboardResolver } from './resolvers/dashboard.resolver';
import { DashboardService } from './service/dashboard.service';
import { GqlJwtAuthGuard } from '@app/common/guards/gql-jwt-auth.guard';
import { GqlRolesGuard } from '@app/common/guards/gql-roles.guard';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_ACCESS_SECRET })],
  providers: [
    DashboardResolver,
    DashboardService,
    GqlJwtAuthGuard,
    GqlRolesGuard,
  ],
  exports: [DashboardService],
})
export class DashboardModule {}
