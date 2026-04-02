// ============================================
// GLOBAL JWT & Session Service
// Works with unified AuthAccount model
// ============================================

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { scrypt, randomBytes, timingSafeEqual, randomUUID } from 'crypto';
import { promisify } from 'util';
import { Types } from 'mongoose';
const scryptAsync = promisify(scrypt);

import { AuthAccount } from '../database/schemas/auth.schema';
import { Doctor, DoctorDocument } from '../database/schemas/doctor.schema';
import { Admin, AdminDocument } from '../database/schemas/admin.schema';
import { User } from '../database/schemas/user.schema';
import { UserRole } from '../database/schemas/common.enums';

// ============================================
// JWT Payload Interfaces
// ============================================

export interface JwtPayload {
  sub: string; // AuthAccount ID
  entityId: string;
  phone: string;
  role: UserRole; // 'doctor' | 'admin' | 'user'
  sessionId: string; // Unique session identifier
  deviceId: string;
  tv: number; // Token version for global revocation
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
  scopes?: string[];
}

export interface JwtUserPayload {
  sub: string; // AuthAccount ID
  phone: string;
  role: UserRole; // 'doctor' | 'admin' | 'user'
  tv: number; // Token version for global revocation
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
  scopes?: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface SessionInfo {
  sessionId: string;
  deviceId: string;
  deviceName: string;
  deviceType: string;
  platform: string;
  ipAddress: string;
  userAgent: string;
}

export interface SessionData {
  sessionId: string;
  deviceId: string;
  deviceName: string;
  deviceType: string;
  platform: string;
  ipAddress: string;
  userAgent: string;
  refreshToken: string; // Hashed
  createdAt: Date;
  lastActivityAt: Date;
  isActive: boolean;
}

// ============================================
// Global Auth Service
// ============================================

@Injectable()
export class AuthValidateService {
  private readonly ACCESS_TOKEN_EXPIRY = '5h'; // 15 minutes
  private readonly REFRESH_TOKEN_EXPIRY = '30d'; // 30 days
  private readonly MAX_SESSIONS = 5; // Max concurrent sessions

  constructor(
    @InjectModel(AuthAccount.name) private authAccountModel: Model<AuthAccount>,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
    @InjectModel(User.name) private userModel: Model<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // ============================================
  // JWT Token Generation
  // ============================================

  /**
   * Generate access and refresh token pair for a session
   */
  async generateTokenPair(
    accountId: string,
    entityId: string,
    phone: string,
    role: UserRole,
    sessionId: string,
    deviceId: string,
    tokenVersion: number,
  ): Promise<TokenPair> {
    // Access Token Payload

    const accessPayload: JwtPayload = {
      sub: accountId,
      entityId,
      phone,
      role,
      sessionId,
      deviceId,
      tv: tokenVersion,
      type: 'access',
    };

    // Refresh Token Payload
    const refreshPayload: JwtPayload = {
      sub: accountId,
      entityId,
      phone,
      role,
      sessionId,
      deviceId,
      tv: tokenVersion,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        expiresIn: this.ACCESS_TOKEN_EXPIRY,
        secret: this.configService.get('JWT_ACCESS_SECRET'),
      }),
      this.jwtService.signAsync(refreshPayload, {
        expiresIn: this.REFRESH_TOKEN_EXPIRY,
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  async generateTokenUserPair(
    accountId: string,
    phone: string,
    role: UserRole,
    tokenVersion: number,
  ): Promise<TokenPair> {
    // Access Token Payload

    const accessPayload: JwtUserPayload = {
      sub: accountId,
      phone,
      role,
      tv: tokenVersion,
      type: 'access',
    };

    // Refresh Token Payload
    const refreshPayload: JwtUserPayload = {
      sub: accountId,
      phone,
      role,
      tv: tokenVersion,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        expiresIn: this.ACCESS_TOKEN_EXPIRY,
        secret: this.configService.get('JWT_ACCESS_SECRET'),
      }),
      this.jwtService.signAsync(refreshPayload, {
        expiresIn: this.REFRESH_TOKEN_EXPIRY,
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Verify and decode access token
   */
  async verifyAccessToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  /**
   * Verify and decode refresh token
   */
  async verifyRefreshToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  // ============================================
  // Helper: Get Entity Model by Role
  // ============================================

  private getEntityModel(role: UserRole): Model<any> {
    switch (role) {
      case UserRole.DOCTOR:
        return this.doctorModel;
      case UserRole.ADMIN:
        return this.adminModel;
      case UserRole.USER:
        return this.userModel;
      default:
        throw new Error(`Unknown role: ${role}`);
    }
  }

  // ============================================
  // Session Management (GLOBAL)
  // ============================================

  /**
   * Create new session for any user type (Doctor/Admin/User)
   */
  async createSession(
    accountId: string,
    phone: string,
    role: UserRole,
    sessionInfo: SessionInfo,
  ): Promise<TokenPair> {
    // 1. Get AuthAccount
    const account = await this.authAccountModel.findById(accountId);
    if (!account) {
      throw new UnauthorizedException('Account not found');
    }

    // 2. Get entity (Doctor/Admin/User)
    const entityModel = this.getEntityModel(role);
    const entity = await entityModel.findOne({
      authAccountId: new Types.ObjectId(accountId.toString()),
    });
    const entityId = entity._id.toString() as string;
    if (!entity) {
      throw new UnauthorizedException(`${role} entity not found`);
    }

    const sessionId = randomUUID();

    // 3. Generate token pair
    const tokens = await this.generateTokenPair(
      accountId,
      entityId,
      phone,
      role,
      sessionId,
      sessionInfo.deviceId,
      account.tokenVersion,
    );

    // 4. Hash refresh token before storing
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scryptAsync(
      tokens.refreshToken,
      salt,
      64,
    )) as Buffer;
    const hashedRefreshToken = `${salt}.${derivedKey.toString('hex')}`;

    // 5. Create session object
    const newSession: SessionData = {
      sessionId,
      deviceId: sessionInfo.deviceId,
      deviceName: sessionInfo.deviceName,
      deviceType: sessionInfo.deviceType,
      platform: sessionInfo.platform,
      ipAddress: sessionInfo.ipAddress,
      userAgent: sessionInfo.userAgent,
      refreshToken: hashedRefreshToken,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      isActive: true,
    };

    // 6. Manage session limit
    if (!entity.sessions) entity.sessions = [];

    if (entity.sessions.length >= (entity.maxSessions || this.MAX_SESSIONS)) {
      entity.sessions.sort(
        (a, b) =>
          new Date(a.lastActivityAt).getTime() -
          new Date(b.lastActivityAt).getTime(),
      );
      entity.sessions.shift(); // Remove oldest
    }

    entity.sessions.push(newSession);

    // 7. Update last login info
    entity.lastLoginAt = new Date();
    entity.lastLoginIp = sessionInfo.ipAddress;
    account.lastLoginAt = new Date();

    await Promise.all([entity.save(), account.save()]);

    return tokens;
  }

  /**
   * Refresh access token using refresh token (GLOBAL)
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenPair> {
    // 1. Verify refresh token
    const payload = await this.verifyRefreshToken(refreshToken);

    // 2. Get AuthAccount
    const account = await this.authAccountModel.findById(payload.sub);
    if (!account) {
      throw new UnauthorizedException('Account not found');
    }

    // 3. Check token version (global revocation)
    if (payload.tv !== account.tokenVersion) {
      throw new UnauthorizedException(
        'Token revoked (password changed or logout all)',
      );
    }

    // 4. Get entity based on role
    const entityModel = this.getEntityModel(payload.role);
    const entity = await entityModel.findOne({
      authAccountId: new Types.ObjectId(account._id.toString()),
    });
    const entityId = entity._id.toString() as string;
    if (!entity) {
      throw new UnauthorizedException(`${payload.role} entity not found`);
    }

    // 5. Find and validate session
    const session = entity.sessions?.find(
      (s) => s.sessionId === payload.sessionId,
    );
    if (!session || !session.isActive) {
      throw new UnauthorizedException('Session expired or invalid');
    }

    // 6. Verify stored refresh token matches
    const [salt, storedHash] = session.refreshToken.split('.');
    const derivedKey = (await scryptAsync(refreshToken, salt, 64)) as Buffer;
    const storedHashBuffer = Buffer.from(storedHash, 'hex');
    const isValidRefreshToken = timingSafeEqual(derivedKey, storedHashBuffer);

    if (!isValidRefreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // 7. Generate new token pair
    const tokens = await this.generateTokenPair(
      account._id.toString(),
      entityId,
      payload.phone,
      payload.role,
      session.sessionId,
      session.deviceId,
      account.tokenVersion,
    );

    // 8. Update session with new refresh token
    const newSalt = randomBytes(16).toString('hex');
    const newDerivedKey = (await scryptAsync(
      tokens.refreshToken,
      newSalt,
      64,
    )) as Buffer;
    const hashedRefreshToken = `${newSalt}.${newDerivedKey.toString('hex')}`;
    session.refreshToken = hashedRefreshToken;
    session.lastActivityAt = new Date();

    await entity.save();

    return tokens;
  }

  async refreshUserAccessToken(refreshToken: string): Promise<TokenPair> {
    // 1. Verify refresh token
    const payload = await this.verifyRefreshToken(refreshToken);

    // 2. Get AuthAccount
    const account = await this.authAccountModel.findById(payload.sub);
    if (!account) {
      throw new UnauthorizedException('Account not found');
    }

    // 3. Check token version (global revocation)
    if (payload.tv !== account.tokenVersion) {
      throw new UnauthorizedException(
        'Token revoked (password changed or logout all)',
      );
    }

    // 4. Get entity based on role
    const entityModel = this.getEntityModel(payload.role);

    if (!entityModel) {
      throw new UnauthorizedException('Entity not found');
    }

    // 7. Generate new token pair
    const tokens = await this.generateTokenUserPair(
      account._id.toString(),
      payload.phone,
      payload.role,
      account.tokenVersion,
    );

    return tokens;
  }
  // ============================================
  // Logout Operations (GLOBAL)
  // ============================================

  /**
   * Logout from specific session
   */
  async logoutSession(
    accountId: string,
    role: UserRole,
    sessionId: string,
  ): Promise<void> {
    const entityModel = this.getEntityModel(role);
    const entity = await entityModel.findOne({
      authAccountId: new Types.ObjectId(accountId.toString()),
    });

    if (!entity) {
      throw new UnauthorizedException('Entity not found');
    }

    entity.sessions = entity.sessions.filter((s) => s.sessionId !== sessionId);
    await entity.save();
  }

  /**
   * Logout from specific device (removes all sessions for that device)
   */
  async logoutDevice(
    accountId: string,
    role: UserRole,
    deviceId: string,
  ): Promise<void> {
    const entityModel = this.getEntityModel(role);
    const entity = await entityModel.findOne({
      authAccountId: new Types.ObjectId(accountId.toString()),
    });

    if (!entity) {
      throw new UnauthorizedException('Entity not found');
    }

    entity.sessions = entity.sessions.filter((s) => s.deviceId !== deviceId);
    await entity.save();
  }

  /**
   * Logout from all sessions (revokes all refresh tokens)
   */
  async logoutAllSessions(accountId: string, role: UserRole): Promise<void> {
    const entityModel = this.getEntityModel(role);
    const entity = await entityModel.findOne({
      authAccountId: new Types.ObjectId(accountId.toString()),
    });

    if (!entity) {
      throw new UnauthorizedException('Entity not found');
    }

    entity.sessions = [];
    await entity.save();
  }

  /**
   * GLOBAL TOKEN REVOCATION - Invalidate ALL tokens across ALL devices
   * Use this for: password reset, security breach, etc.
   */
  async revokeAllTokens(accountId: string, role: UserRole): Promise<void> {
    const account = await this.authAccountModel.findById(accountId);
    if (!account) {
      throw new UnauthorizedException('Account not found');
    }

    // Increment token version (invalidates all existing tokens)
    account.tokenVersion += 1;
    await account.save();

    // Also clear all sessions
    await this.logoutAllSessions(accountId, role);
  }

  // ============================================
  // Session Info (GLOBAL)
  // ============================================

  /**
   * Get all active sessions
   */
  async getActiveSessions(accountId: string, role: UserRole) {
    const entityModel = this.getEntityModel(role);
    const entity = await entityModel
      .findOne({
        authAccountId: new Types.ObjectId(accountId.toString()),
      })
      .lean();

    if (!entity) {
      throw new UnauthorizedException('Entity not found');
    }

    return (entity.sessions || [])
      .filter((s) => s.isActive)
      .map((session) => ({
        sessionId: session.sessionId,
        deviceId: session.deviceId,
        deviceName: session.deviceName,
        deviceType: session.deviceType,
        platform: session.platform,
        ipAddress: session.ipAddress,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
      }));
  }

  /**
   * Update session activity (called on each request via JWT strategy)
   */
  async updateSessionActivity(
    accountId: string,
    role: UserRole,
    sessionId: string,
  ): Promise<void> {
    const entityModel = this.getEntityModel(role);
    const entity = await entityModel.findOne({
      authAccountId: new Types.ObjectId(accountId.toString()),
    });

    if (entity) {
      const session = entity.sessions?.find((s) => s.sessionId === sessionId);
      if (session) {
        session.lastActivityAt = new Date();
        await entity.save();
      }
    }
  }

  // ============================================
  // Account Retrieval for JWT Strategy
  // ============================================

  /**
   * Get account by ID (used in JWT strategy validation)
   */
  async getAccount(accountId: string): Promise<AuthAccount | null> {
    return this.authAccountModel.findById(accountId);
  }

  /**
   * Validate user and return full user object with role-specific data
   */
  async validateUser(accountId: string) {
    const account = await this.authAccountModel.findById(accountId);
    if (!account) {
      throw new UnauthorizedException('Account not found');
    }

    const entityModel = this.getEntityModel(account.role);
    const entity = await entityModel.findOne({
      authAccountId: new Types.ObjectId(accountId.toString()),
    });
    if (!entity) {
      throw new UnauthorizedException('Entity not found');
    }

    return {
      accountId: account._id,
      phone: account.phones[0],
      role: account.role,
      isActive: account.isActive,
      tokenVersion: account.tokenVersion,
      entity, // Full doctor/admin/user object
    };
  }

  async validateUserRole(accountId: string) {
    const account = await this.authAccountModel.findById(accountId);
    if (!account) {
      throw new UnauthorizedException('Account not found');
    }

    const entityModel = this.getEntityModel(account.role);
    const entity = await entityModel.findOne({
      authAccountId: new Types.ObjectId(accountId),
    });

    if (!entityModel) {
      throw new UnauthorizedException('Entity Model not found');
    }
    if (!entity && !entityModel) {
      throw new UnauthorizedException('Entity not found');
    }

    return {
      accountId: account._id,
      phone: account.phones[0],
      role: account.role,
      isActive: account.isActive,
      tokenVersion: account.tokenVersion,
      entity,
    };
  }

  // ============================================
  // Cleanup (Cron Job)
  // ============================================

  /**
   * Clean up expired sessions across all entities
   */
  async cleanupExpiredSessions(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let totalCleaned = 0;

    for (const role of Object.values(UserRole)) {
      const entityModel = this.getEntityModel(role);
      const result = await entityModel.updateMany(
        {},
        {
          $pull: {
            sessions: {
              lastActivityAt: { $lt: thirtyDaysAgo },
            },
          },
        },
      );
      totalCleaned += result.modifiedCount;
    }

    return totalCleaned;
  }
}
