import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GqlExecutionContext } from '@nestjs/graphql';

@Injectable()
export class GqlJwtAuthGuard extends AuthGuard('jwt') {
  // ✅ Extract request from GraphQL context instead of HTTP context
  getRequest(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext().req;
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
