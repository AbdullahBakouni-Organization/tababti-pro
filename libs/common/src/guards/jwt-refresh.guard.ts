import {
  ExecutionContext,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      // ✅ لو err مش HttpException، لا تعيد رميه كما هو
      if (err instanceof HttpException) throw err;
      throw new UnauthorizedException(
        typeof err === 'string' ? err : 'Invalid or expired access token',
      );
    }
    return user;
  }
}
