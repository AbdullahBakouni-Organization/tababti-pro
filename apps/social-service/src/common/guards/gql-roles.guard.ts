import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ROLES_KEY } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';

@Injectable()
export class GqlRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) return true;

    const gqlCtx = GqlExecutionContext.create(context);
    const user = gqlCtx.getContext<{ req: any }>()?.req?.user;

    if (!user) throw new ForbiddenException('user.UNAUTHORIZED');

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('user.UNAUTHORIZED');
    }

    return true;
  }
}
