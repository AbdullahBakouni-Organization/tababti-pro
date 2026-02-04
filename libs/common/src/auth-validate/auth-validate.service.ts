// ============================================
// JWT & Session Service
// ============================================

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { scrypt, randomBytes, timingSafeEqual, randomUUID } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);
import { Doctor, DoctorDocument } from '../database/schemas/doctor.schema';

// ============================================
// JWT Payload Interfaces
// ============================================

export interface JwtPayload {
  sub: string; // Doctor ID
  phone: string;
  sessionId: string; // Unique session identifier
  deviceId: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
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

// ============================================
// Auth Service
// ============================================

@Injectable()
export class AuthValidateService {
  private readonly ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
  private readonly REFRESH_TOKEN_EXPIRY = '30d'; // 30 days

  constructor(
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
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
    doctorId: string,
    phone: string,
    sessionId: string,
    deviceId: string,
  ): Promise<TokenPair> {
    // Access Token Payload
    const accessPayload: JwtPayload = {
      sub: doctorId,
      phone,
      sessionId,
      deviceId,
      type: 'access',
    };

    // Refresh Token Payload
    const refreshPayload: JwtPayload = {
      sub: doctorId,
      phone,
      sessionId,
      deviceId,
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
  // Session Management
  // ============================================

  /**
   * Create new session for a doctor
   */
  async createSession(
    doctor: DoctorDocument,
    sessionInfo: SessionInfo,
  ): Promise<TokenPair> {
    const sessionId = randomUUID();

    // Generate token pair
    const tokens = await this.generateTokenPair(
      doctor._id.toString(),
      doctor.phones[0]?.normal?.[0] || doctor.phones[0]?.clinic?.[0] || '', // Use first available phone number
      sessionId,
      sessionInfo.deviceId,
    );

    // Hash refresh token before storing
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scryptAsync(
      tokens.refreshToken,
      salt,
      64,
    )) as Buffer;
    const hashedRefreshToken = `${salt}.${derivedKey.toString('hex')}`;

    // Add session to doctor
    const newSession = {
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

    // Remove oldest session if max limit reached
    if (doctor.sessions.length >= doctor.maxSessions) {
      doctor.sessions.sort(
        (a, b) =>
          new Date(a.lastActivityAt).getTime() -
          new Date(b.lastActivityAt).getTime(),
      );
      doctor.sessions.shift(); // Remove oldest
    }

    doctor.sessions.push(newSession as any);

    // Update last login
    doctor.lastLoginAt = new Date();
    doctor.lastLoginIp = sessionInfo.ipAddress;

    await doctor.save();

    return tokens;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenPair> {
    // Verify refresh token
    const payload = await this.verifyRefreshToken(refreshToken);

    // Find doctor and session
    const doctor = await this.doctorModel.findById(payload.sub);
    if (!doctor) {
      throw new UnauthorizedException('Doctor not found');
    }

    const session = doctor.sessions.find(
      (s) => s.sessionId === payload.sessionId,
    );
    if (!session || !session.isActive) {
      throw new UnauthorizedException('Session expired or invalid');
    }

    // Verify stored refresh token matches
    const [salt, storedHash] = session.refreshToken.split('.');
    const derivedKey = (await scryptAsync(refreshToken, salt, 64)) as Buffer;
    const storedHashBuffer = Buffer.from(storedHash, 'hex');
    const isValidRefreshToken = timingSafeEqual(derivedKey, storedHashBuffer);

    if (!isValidRefreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Generate new token pair
    const tokens = await this.generateTokenPair(
      doctor._id.toString(),
      doctor.phones[0]?.normal?.[0] || doctor.phones[0]?.clinic?.[0] || '', // Use first available phone number
      session.sessionId,
      session.deviceId,
    );

    // Update session with new refresh token
    const newSalt = randomBytes(16).toString('hex');
    const newDerivedKey = (await scryptAsync(
      tokens.refreshToken,
      newSalt,
      64,
    )) as Buffer;
    const hashedRefreshToken = `${newSalt}.${newDerivedKey.toString('hex')}`;
    session.refreshToken = hashedRefreshToken;
    session.lastActivityAt = new Date();

    await doctor.save();

    return tokens;
  }

  /**
   * Logout from specific session
   */
  async logoutSession(doctorId: string, sessionId: string): Promise<void> {
    const doctor = await this.doctorModel.findById(doctorId);
    if (!doctor) {
      throw new UnauthorizedException('Doctor not found');
    }

    doctor.sessions = doctor.sessions.filter((s) => s.sessionId !== sessionId);
    await doctor.save();
  }

  /**
   * Logout from specific device (removes all sessions for that device)
   */
  async logoutDevice(doctorId: string, deviceId: string): Promise<void> {
    const doctor = await this.doctorModel.findById(doctorId);
    if (!doctor) {
      throw new UnauthorizedException('Doctor not found');
    }

    doctor.sessions = doctor.sessions.filter((s) => s.deviceId !== deviceId);
    await doctor.save();
  }

  /**
   * Logout from all devices
   */
  async logoutAllSessions(doctorId: string): Promise<void> {
    const doctor = await this.doctorModel.findById(doctorId);
    if (!doctor) {
      throw new UnauthorizedException('Doctor not found');
    }

    doctor.sessions = [];
    await doctor.save();
  }

  /**
   * Get all active sessions for a doctor
   */
  async getActiveSessions(doctorId: string) {
    const doctor = await this.doctorModel.findById(doctorId).lean();
    if (!doctor) {
      throw new UnauthorizedException('Doctor not found');
    }

    return doctor.sessions
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
   * Update session activity (called on each request)
   */
  async updateSessionActivity(
    doctorId: string,
    sessionId: string,
  ): Promise<void> {
    const doctor = await this.doctorModel.findById(doctorId);
    if (doctor) {
      const session = doctor.sessions.find((s) => s.sessionId === sessionId);
      if (session) {
        session.lastActivityAt = new Date();
      }
      await doctor.save();
    }
  }

  /**
   * Clean up expired sessions (run as cron job)
   */
  async cleanupExpiredSessions(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.doctorModel.updateMany(
      {},
      {
        $pull: {
          sessions: {
            lastActivityAt: { $lt: thirtyDaysAgo },
          },
        },
      },
    );

    return result.modifiedCount;
  }
}

// ============================================
// JWT vs Session Strategy Explanation
// ============================================

/*
┌─────────────────────────────────────────────────────────────────┐
│ JWT vs SESSION STRATEGY - HYBRID APPROACH                       │
└─────────────────────────────────────────────────────────────────┘

1. JWT (Stateless Authentication)
   ✅ Access Token: Short-lived (15 minutes), validates identity
   ✅ Refresh Token: Long-lived (30 days), renews access tokens
   ✅ No server-side storage needed for access tokens
   ✅ Fast validation - just verify signature
   ✅ Contains user info (sub, phone, sessionId, deviceId)

2. Session (Stateful Tracking)
   ✅ Stored in MongoDB (doctor.sessions array)
   ✅ Tracks ALL active devices/sessions
   ✅ Enables multi-device management
   ✅ Allows selective logout (specific device/session)
   ✅ Stores refresh tokens securely (hashed)

3. Why Hybrid?
   ┌─────────────────────────────────────────────────────────────┐
   │ JWT ALONE (Stateless)                                        │
   ├─────────────────────────────────────────────────────────────┤
   │ ✅ Fast validation                                           │
   │ ❌ Cannot invalidate tokens (logout doesn't work)           │
   │ ❌ No multi-device tracking                                 │
   │ ❌ Cannot revoke specific device                            │
   └─────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────┐
   │ SESSION ALONE (Stateful)                                     │
   ├─────────────────────────────────────────────────────────────┤
   │ ✅ Full control over sessions                               │
   │ ❌ Requires database lookup on EVERY request                │
   │ ❌ Slower performance                                       │
   │ ❌ Harder to scale horizontally                             │
   └─────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────┐
   │ HYBRID (Best of Both)                                        │
   ├─────────────────────────────────────────────────────────────┤
   │ ✅ Fast access token validation (stateless)                 │
   │ ✅ Multi-device session tracking                            │
   │ ✅ Logout works (remove session = invalidate refresh)       │
   │ ✅ Can logout specific devices                              │
   │ ✅ Refresh tokens stored securely in database               │
   └─────────────────────────────────────────────────────────────┘

4. Flow:
   a) Login:
      - Generate sessionId + deviceId
      - Create access token (15min, stateless)
      - Create refresh token (30d, stored in DB)
      - Save session to doctor.sessions[]

   b) API Request:
      - Validate access token (JWT verify - NO DB call)
      - If expired: Use refresh token to get new access token

   c) Logout from Device:
      - Find sessions with deviceId
      - Remove from doctor.sessions[]
      - Refresh tokens now invalid

   d) Logout All:
      - Clear doctor.sessions[]
      - All refresh tokens invalid
      - Access tokens expire in 15min max

5. Security Benefits:
   - Access tokens short-lived (15min)
   - Refresh tokens hashed before storage
   - Can revoke sessions immediately
   - Max 5 concurrent sessions per doctor
   - Failed login attempts tracking
   - Account locking after 5 failures
   - Session activity tracking

6. Performance:
   - 99% of requests: Fast (JWT verify only)
   - 1% of requests: Refresh (DB lookup + update)
   - Session management: Only on login/logout
*/
