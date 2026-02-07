import 'dotenv';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { UserRole } from '@app/common/database/schemas/common.enums';

interface JwtPayload {
  sub: string;
  role: UserRole;
  tv: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'supersecret',
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload?.sub || !payload?.role) {
      throw new UnauthorizedException('Invalid token');
    }

    return {
      id: payload.sub,
      role: payload.role,
      tokenVersion: payload.tv,
    };
  }
}

/*import 'dotenv';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { AuthService } from 'apps/home-service/src/auth/auth.service';
import { UserRole } from '@app/common/database/schemas/common.enums';

interface JwtPayload {
  sub: string;
  role: UserRole;
  tv: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'supersecret',
    });
  }

  async validate(payload: JwtPayload) {
    const account = await this.authService.getAccount(payload.sub);
    if (payload.tv !== account?.tokenVersion) {
      throw new UnauthorizedException('Token revoked');
    }
    const user = await this.authService.validateUser(payload.sub);

    return user;
  }
}
*/
