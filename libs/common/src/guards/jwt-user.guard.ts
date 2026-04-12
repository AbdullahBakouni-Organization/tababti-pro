import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// ============================================
// Access Token Guard (Default)
// ============================================

@Injectable()
export class JwtUserGuard extends AuthGuard('jwt-user') {
  canActivate(context: ExecutionContext) {
    // Add custom logic here if needed
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
