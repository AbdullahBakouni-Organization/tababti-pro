import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Roles required by the handler/class
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If endpoint has no @Roles decorator => allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // JwtStrategy puts this
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException('auth.ROLE_NOT_FOUND');
    }

    // Check role match
    const isAllowed = requiredRoles.includes(user.role);

    if (!isAllowed) {
      throw new ForbiddenException('auth.INSUFFICIENT_PERMISSIONS');
    }

    return true;
  }
}
