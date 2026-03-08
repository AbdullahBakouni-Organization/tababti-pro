// ============================================
// GLOBAL JWT Strategy
// Works with unified AuthAccount model
// ============================================
import 'dotenv/config';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthValidateService, JwtPayload } from '../auth-validate';
import { refreshTokenFromCookie } from './refresh-token-extracter';
import type { Request } from 'express';
import { refreshAdminTokenFromCookie } from './refresh-toekn-admin-extracter';

// ============================================
// JwtStrategy — access token (Doctor/Admin)
// ============================================
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly authValidateService: AuthValidateService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET || 'supersecret',
    });
  }

  async validate(payload: JwtPayload) {
    const account = await this.authValidateService.getAccount(payload.sub);
    if (!account) {
      throw new UnauthorizedException('auth.ACCOUNT_NOT_FOUND');
    }

    if (!account.isActive) {
      throw new UnauthorizedException('auth.ACCOUNT_DEACTIVATED');
    }

    if (payload.tv !== account.tokenVersion) {
      throw new UnauthorizedException('auth.TOKEN_REVOKED');
    }

    const user = await this.authValidateService.validateUser(payload.sub);

    if (payload.sessionId) {
      const sessions = await this.authValidateService.getActiveSessions(
        payload.sub,
        payload.role,
      );

      const sessionExists = sessions.some(
        (s) => s.sessionId === payload.sessionId,
      );

      if (!sessionExists) {
        throw new UnauthorizedException('auth.SESSION_EXPIRED');
      }

      this.authValidateService
        .updateSessionActivity(payload.sub, payload.role, payload.sessionId)
        .catch(() => {});
    }

    return {
      accountId: payload.sub,
      phone: payload.phone,
      role: payload.role,
      sessionId: payload.sessionId,
      deviceId: payload.deviceId,
      entity: user.entity,
    };
  }
}

// ============================================
// JwtRefreshStrategy — refresh token via cookie
// ============================================
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private readonly authValidateService: AuthValidateService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([refreshTokenFromCookie]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_REFRESH_SECRET || 'supersecret',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const refreshToken = refreshTokenFromCookie(req);
    if (!refreshToken) {
      throw new UnauthorizedException('auth.REFRESH_TOKEN_NOT_FOUND');
    }

    const account = await this.authValidateService.getAccount(payload.sub);
    if (!account) {
      throw new UnauthorizedException('auth.ACCOUNT_NOT_FOUND');
    }
    if (!account.isActive) {
      throw new UnauthorizedException('auth.ACCOUNT_DEACTIVATED');
    }

    if (payload.tv !== account.tokenVersion) {
      throw new UnauthorizedException('auth.TOKEN_REVOKED');
    }

    return {
      accountId: payload.sub,
      role: payload.role,
      sessionId: payload.sessionId,
      refreshToken,
    };
  }
}

// ============================================
// JwtRefreshAdminStrategy — refresh token via cookie (admin)
// ============================================
@Injectable()
export class JwtRefreshAdminStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh-admin',
) {
  constructor(private readonly authValidateService: AuthValidateService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([refreshAdminTokenFromCookie]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_REFRESH_SECRET || 'supersecret',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const refreshToken = refreshAdminTokenFromCookie(req);
    if (!refreshToken) {
      throw new UnauthorizedException('auth.REFRESH_TOKEN_NOT_FOUND');
    }

    const account = await this.authValidateService.getAccount(payload.sub);
    if (!account) {
      throw new UnauthorizedException('auth.ACCOUNT_NOT_FOUND');
    }
    if (!account.isActive) {
      throw new UnauthorizedException('auth.ACCOUNT_DEACTIVATED');
    }

    if (payload.tv !== account.tokenVersion) {
      throw new UnauthorizedException('auth.TOKEN_REVOKED');
    }

    return {
      accountId: payload.sub,
      role: payload.role,
      sessionId: payload.sessionId,
      refreshToken,
    };
  }
}

// ============================================
// JwtUserStrategy — access token (User role)
// ============================================
@Injectable()
export class JwtUserStrategy extends PassportStrategy(Strategy, 'jwt-user') {
  constructor(private readonly authValidateService: AuthValidateService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET || 'supersecret',
    });
  }

  async validate(payload: JwtPayload) {
    const account = await this.authValidateService.getAccount(payload.sub);
    if (!account) {
      throw new UnauthorizedException('auth.ACCOUNT_NOT_FOUND');
    }

    if (!account.isActive) {
      throw new UnauthorizedException('auth.ACCOUNT_DEACTIVATED');
    }

    if (payload.tv !== account.tokenVersion) {
      throw new UnauthorizedException('auth.TOKEN_REVOKED');
    }

    const user = await this.authValidateService.validateUserRole(payload.sub);

    if (payload.sessionId) {
      const sessions = await this.authValidateService.getActiveSessions(
        payload.sub,
        payload.role,
      );

      const sessionExists = sessions.some(
        (s) => s.sessionId === payload.sessionId,
      );

      if (!sessionExists) {
        throw new UnauthorizedException('auth.SESSION_EXPIRED');
      }

      this.authValidateService
        .updateSessionActivity(payload.sub, payload.role, payload.sessionId)
        .catch(() => {});
    }

    return {
      accountId: payload.sub,
      phone: payload.phone,
      role: payload.role,
      sessionId: payload.sessionId,
      deviceId: payload.deviceId,
      entity: user.entity,
    };
  }
}

// ============================================
// JwtUserRefreshStrategy — refresh token from body (User role)
// ============================================
@Injectable()
export class JwtUserRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-user-refresh',
) {
  constructor(private readonly authValidateService: AuthValidateService) {
    super({
      jwtFromRequest: (req: Request) => req?.body?.refreshToken,
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_REFRESH_SECRET || 'supersecret',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const refreshToken = req.body?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('auth.REFRESH_TOKEN_NOT_FOUND');
    }

    const account = await this.authValidateService.getAccount(payload.sub);
    if (!account) {
      throw new UnauthorizedException('auth.ACCOUNT_NOT_FOUND');
    }
    if (!account.isActive) {
      throw new UnauthorizedException('auth.ACCOUNT_DEACTIVATED');
    }

    if (payload.tv !== account.tokenVersion) {
      throw new UnauthorizedException('auth.TOKEN_REVOKED');
    }

    return {
      accountId: payload.sub,
      role: payload.role,
      sessionId: payload.sessionId,
      refreshToken,
    };
  }
}
