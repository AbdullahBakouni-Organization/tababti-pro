import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class GqlJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const gqlCtx = GqlExecutionContext.create(context);
    const req = gqlCtx.getContext<{ req: any }>()?.req;

    const authHeader: string = req?.headers?.authorization ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) throw new UnauthorizedException('common.UNAUTHORIZED');

    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      req.user = payload; // attach to request so resolvers can read it
      return true;
    } catch {
      throw new UnauthorizedException('common.UNAUTHORIZED');
    }
  }
}
