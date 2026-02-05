import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    request.user = {
      id: '000000000000000000000001',
      role: 'user',
    };

    return true;
  }
}
