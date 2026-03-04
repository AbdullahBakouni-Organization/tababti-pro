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
    // 1️⃣ Load account (single source of truth)
    const account = await this.authValidateService.getAccount(payload.sub);
    if (!account) {
      throw new UnauthorizedException('Account not found');
    }

    // 2️⃣ Check if account is active
    if (!account.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // 3️⃣ Global revocation check (logout-all, password reset, etc.)
    if (payload.tv !== account.tokenVersion) {
      throw new UnauthorizedException(
        'Token revoked (password changed or global logout)',
      );
    }
    // 4️⃣ Get full user data (Doctor/Admin/User entity)
    const user = await this.authValidateService.validateUser(payload.sub);

    // 5️⃣ OPTIONAL: Session-based validation (recommended for security)
    if (payload.sessionId) {
      const sessions = await this.authValidateService.getActiveSessions(
        payload.sub,
        payload.role,
      );

      const sessionExists = sessions.some(
        (s) => s.sessionId === payload.sessionId,
      );

      if (!sessionExists) {
        throw new UnauthorizedException('Session revoked or expired');
      }

      // Update session activity (background task - don't await)
      this.authValidateService
        .updateSessionActivity(payload.sub, payload.role, payload.sessionId)
        .catch(() => {}); // Silent fail
    }

    // 6️⃣ Return user object for request context
    return {
      accountId: payload.sub,
      phone: payload.phone,
      role: payload.role,
      sessionId: payload.sessionId,
      deviceId: payload.deviceId,
      entity: user.entity, // Full Doctor/Admin/User object
    };
  }
}

// ============================================
// Refresh Token Strategy (Optional but Recommended)
// ============================================

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private readonly authValidateService: AuthValidateService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        refreshTokenFromCookie, // 👈 cookie extractor
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_REFRESH_SECRET || 'supersecret',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const refreshToken = refreshTokenFromCookie(req);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found in cookies');
    }
    // 1️⃣ Validate account
    const account = await this.authValidateService.getAccount(payload.sub);
    if (!account || !account.isActive) {
      throw new UnauthorizedException('Account not found or inactive');
    }

    // 2️⃣ Token version check (revocation support)
    if (payload.tv !== account.tokenVersion) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    return {
      accountId: payload.sub,
      role: payload.role,
      sessionId: payload.sessionId,
      refreshToken, // optional but useful
    };
  }
}

@Injectable()
export class JwtRefreshAdminStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh-admin',
) {
  constructor(private readonly authValidateService: AuthValidateService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        refreshAdminTokenFromCookie, // 👈 cookie extractor
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_REFRESH_SECRET || 'supersecret',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const refreshToken = refreshAdminTokenFromCookie(req);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found in cookies');
    }
    // 1️⃣ Validate account
    const account = await this.authValidateService.getAccount(payload.sub);
    if (!account || !account.isActive) {
      throw new UnauthorizedException('Account not found or inactive');
    }

    // 2️⃣ Token version check (revocation support)
    if (payload.tv !== account.tokenVersion) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    return {
      accountId: payload.sub,
      role: payload.role,
      sessionId: payload.sessionId,
      refreshToken, // optional but useful
    };
  }
}

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
    // 1️⃣ Load account (single source of truth)
    const account = await this.authValidateService.getAccount(payload.sub);
    if (!account) {
      throw new UnauthorizedException('Account not found');
    }

    // 2️⃣ Check if account is active
    if (!account.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // 3️⃣ Global revocation check (logout-all, password reset, etc.)
    if (payload.tv !== account.tokenVersion) {
      throw new UnauthorizedException(
        'Token revoked (password changed or global logout)',
      );
    }
    // 4️⃣ Get full user data (Doctor/Admin/User entity)
    const user = await this.authValidateService.validateUserRole(payload.sub);

    // 5️⃣ OPTIONAL: Session-based validation (recommended for security)
    if (payload.sessionId) {
      const sessions = await this.authValidateService.getActiveSessions(
        payload.sub,
        payload.role,
      );

      const sessionExists = sessions.some(
        (s) => s.sessionId === payload.sessionId,
      );

      if (!sessionExists) {
        throw new UnauthorizedException('Session revoked or expired');
      }

      // Update session activity (background task - don't await)
      this.authValidateService
        .updateSessionActivity(payload.sub, payload.role, payload.sessionId)
        .catch(() => {}); // Silent fail
    }

    // 6️⃣ Return user object for request context
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

@Injectable()
export class JwtUserRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-user-refresh',
) {
  constructor(private readonly authValidateService: AuthValidateService) {
    super({
      jwtFromRequest: (req: Request) => {
        return req?.body?.refreshToken; // ✅ FROM BODY
      },
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_REFRESH_SECRET || 'supersecret',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const refreshToken = req.body?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException(
        'Refresh token not found in request body',
      );
    }

    const account = await this.authValidateService.getAccount(payload.sub);
    if (!account || !account.isActive) {
      throw new UnauthorizedException('Account not found or inactive');
    }

    if (payload.tv !== account.tokenVersion) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    return {
      accountId: payload.sub,
      role: payload.role,
      sessionId: payload.sessionId,
      refreshToken,
    };
  }
}
