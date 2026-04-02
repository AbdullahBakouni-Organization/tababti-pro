import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { AuthValidateService } from './auth-validate.service';
import { AuthAccount } from '../database/schemas/auth.schema';
import { Doctor } from '../database/schemas/doctor.schema';
import { Admin } from '../database/schemas/admin.schema';
import { User } from '../database/schemas/user.schema';
import { UserRole } from '../database/schemas/common.enums';
import { ConfigService } from '@nestjs/config';
import { createMockConfigService, createMockModel } from '../testing';

describe('AuthValidateService', () => {
  let service: AuthValidateService;
  let authAccountModel: ReturnType<typeof createMockModel>;
  let doctorModel: ReturnType<typeof createMockModel>;
  let adminModel: ReturnType<typeof createMockModel>;
  let userModel: ReturnType<typeof createMockModel>;
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let configService: ReturnType<typeof createMockConfigService>;

  const accountId = new Types.ObjectId().toString();
  const entityId = new Types.ObjectId().toString();
  const mockTokenVersion = 1;

  const mockAccount = {
    _id: new Types.ObjectId(accountId),
    phones: ['+963912345678'],
    role: UserRole.USER,
    isActive: true,
    tokenVersion: mockTokenVersion,
    lastLoginAt: null,
    save: jest.fn().mockResolvedValue(undefined),
    toString: () => accountId,
  };

  const mockEntity = {
    _id: new Types.ObjectId(entityId),
    authAccountId: new Types.ObjectId(accountId),
    sessions: [],
    maxSessions: 5,
    lastLoginAt: null,
    lastLoginIp: null,
    isActive: true,
    save: jest.fn().mockResolvedValue(undefined),
  };

  const mockPayload = {
    sub: accountId,
    entityId,
    phone: '+963912345678',
    role: UserRole.USER,
    sessionId: 'session-1',
    deviceId: 'device-1',
    tv: mockTokenVersion,
    type: 'access' as const,
  };

  beforeEach(async () => {
    authAccountModel = createMockModel();
    doctorModel = createMockModel();
    adminModel = createMockModel();
    userModel = createMockModel();
    configService = createMockConfigService({
      JWT_ACCESS_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
    });

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
      verifyAsync: jest.fn().mockResolvedValue(mockPayload),
    };

    mockAccount.save.mockResolvedValue(undefined);
    mockEntity.save.mockResolvedValue(undefined);
    mockEntity.sessions = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthValidateService,
        {
          provide: getModelToken(AuthAccount.name),
          useValue: authAccountModel,
        },
        { provide: getModelToken(Doctor.name), useValue: doctorModel },
        { provide: getModelToken(Admin.name), useValue: adminModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AuthValidateService>(AuthValidateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── generateTokenPair ────────────────────────────────────────────────────

  describe('generateTokenPair()', () => {
    it('generates access and refresh tokens', async () => {
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.generateTokenPair(
        accountId,
        entityId,
        '+963912345678',
        UserRole.USER,
        'session-id',
        'device-id',
        1,
      );

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
    });

    it('signs access token with type: access', async () => {
      await service.generateTokenPair(
        accountId,
        entityId,
        '+963912345678',
        UserRole.DOCTOR,
        'session-id',
        'device-id',
        2,
      );

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'access', role: UserRole.DOCTOR }),
        expect.any(Object),
      );
    });

    it('signs refresh token with type: refresh', async () => {
      await service.generateTokenPair(
        accountId,
        entityId,
        '+963912345678',
        UserRole.USER,
        'session-id',
        'device-id',
        1,
      );

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'refresh' }),
        expect.any(Object),
      );
    });
  });

  // ─── generateTokenUserPair ────────────────────────────────────────────────

  describe('generateTokenUserPair()', () => {
    it('generates simplified token pair without sessionId/deviceId', async () => {
      jwtService.signAsync
        .mockResolvedValueOnce('user-access')
        .mockResolvedValueOnce('user-refresh');

      const result = await service.generateTokenUserPair(
        accountId,
        '+963912345678',
        UserRole.USER,
        1,
      );

      expect(result.accessToken).toBe('user-access');
      expect(result.refreshToken).toBe('user-refresh');
    });

    it('does not include sessionId or deviceId in payload', async () => {
      await service.generateTokenUserPair(
        accountId,
        '+963912345678',
        UserRole.USER,
        1,
      );

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.not.objectContaining({ sessionId: expect.anything() }),
        expect.any(Object),
      );
    });
  });

  // ─── verifyAccessToken ────────────────────────────────────────────────────

  describe('verifyAccessToken()', () => {
    it('returns decoded payload for valid token', async () => {
      jwtService.verifyAsync.mockResolvedValue(mockPayload);

      const result = await service.verifyAccessToken('valid-token');
      expect(result).toEqual(mockPayload);
    });

    it('throws UnauthorizedException for invalid/expired token', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(service.verifyAccessToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── verifyRefreshToken ───────────────────────────────────────────────────

  describe('verifyRefreshToken()', () => {
    it('returns decoded payload for valid refresh token', async () => {
      const refreshPayload = { ...mockPayload, type: 'refresh' as const };
      jwtService.verifyAsync.mockResolvedValue(refreshPayload);

      const result = await service.verifyRefreshToken('valid-refresh');
      expect(result.type).toBe('refresh');
    });

    it('throws UnauthorizedException for invalid refresh token', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await expect(service.verifyRefreshToken('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── createSession ────────────────────────────────────────────────────────

  describe('createSession()', () => {
    const sessionInfo = {
      sessionId: 'sess-1',
      deviceId: 'dev-1',
      deviceName: 'iPhone 15',
      deviceType: 'mobile',
      platform: 'iOS',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    };

    beforeEach(() => {
      authAccountModel.findById.mockResolvedValue(mockAccount);
      userModel.findOne.mockResolvedValue({ ...mockEntity });
      jwtService.signAsync
        .mockResolvedValueOnce('access-tok')
        .mockResolvedValueOnce('refresh-tok');
    });

    it('returns token pair', async () => {
      const result = await service.createSession(
        accountId,
        '+963912345678',
        UserRole.USER,
        sessionInfo,
      );

      expect(result.accessToken).toBe('access-tok');
      expect(result.refreshToken).toBe('refresh-tok');
    });

    it('throws UnauthorizedException when account not found', async () => {
      authAccountModel.findById.mockResolvedValue(null);

      await expect(
        service.createSession(
          accountId,
          '+963912345678',
          UserRole.USER,
          sessionInfo,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('evicts oldest session when max sessions (5) are reached', async () => {
      const fullSessions = Array.from({ length: 5 }, (_, i) => ({
        sessionId: `sess-${i}`,
        lastActivityAt: new Date(Date.now() - (5 - i) * 1000),
        isActive: true,
        deviceId: `dev-${i}`,
        refreshToken: 'hash',
        createdAt: new Date(),
      }));

      const entityWithFullSessions = {
        ...mockEntity,
        sessions: [...fullSessions],
        save: jest.fn().mockResolvedValue(undefined),
      };
      userModel.findOne.mockResolvedValue(entityWithFullSessions);

      await service.createSession(
        accountId,
        '+963912345678',
        UserRole.USER,
        sessionInfo,
      );

      // Should still have 5 sessions after eviction + add
      expect(entityWithFullSessions.sessions).toHaveLength(5);
    });
  });

  // ─── refreshUserAccessToken ───────────────────────────────────────────────

  describe('refreshUserAccessToken()', () => {
    it('generates new tokens for valid refresh token', async () => {
      const refreshPayload = { ...mockPayload, type: 'refresh' as const };
      jwtService.verifyAsync.mockResolvedValue(refreshPayload);
      authAccountModel.findById.mockResolvedValue(mockAccount);
      userModel.findOne.mockResolvedValue(mockEntity);
      jwtService.signAsync
        .mockResolvedValueOnce('new-access')
        .mockResolvedValueOnce('new-refresh');

      const result = await service.refreshUserAccessToken('refresh-token');

      expect(result.accessToken).toBe('new-access');
      expect(result.refreshToken).toBe('new-refresh');
    });

    it('throws UnauthorizedException when account not found', async () => {
      jwtService.verifyAsync.mockResolvedValue(mockPayload);
      authAccountModel.findById.mockResolvedValue(null);

      await expect(
        service.refreshUserAccessToken('refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token version is revoked', async () => {
      jwtService.verifyAsync.mockResolvedValue({ ...mockPayload, tv: 99 });
      authAccountModel.findById.mockResolvedValue({
        ...mockAccount,
        tokenVersion: 1,
      });

      await expect(
        service.refreshUserAccessToken('old-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── logoutSession ────────────────────────────────────────────────────────

  describe('logoutSession()', () => {
    it('removes specific session from entity sessions', async () => {
      const entityWithSession = {
        ...mockEntity,
        sessions: [
          {
            sessionId: 'sess-to-remove',
            isActive: true,
            deviceId: 'dev-1',
            refreshToken: 'hash',
            createdAt: new Date(),
            lastActivityAt: new Date(),
          },
          {
            sessionId: 'sess-keep',
            isActive: true,
            deviceId: 'dev-2',
            refreshToken: 'hash',
            createdAt: new Date(),
            lastActivityAt: new Date(),
          },
        ],
        save: jest.fn().mockResolvedValue(undefined),
      };
      userModel.findOne.mockResolvedValue(entityWithSession);

      await service.logoutSession(accountId, UserRole.USER, 'sess-to-remove');

      expect(
        entityWithSession.sessions.find(
          (s) => s.sessionId === 'sess-to-remove',
        ),
      ).toBeUndefined();
      expect(entityWithSession.sessions).toHaveLength(1);
      expect(entityWithSession.save).toHaveBeenCalled();
    });
  });

  // ─── logoutAllSessions ────────────────────────────────────────────────────

  describe('logoutAllSessions()', () => {
    it('clears all sessions from entity', async () => {
      const entityWithSessions = {
        ...mockEntity,
        sessions: [{ sessionId: 'sess-1' }, { sessionId: 'sess-2' }],
        save: jest.fn().mockResolvedValue(undefined),
      };
      userModel.findOne.mockResolvedValue(entityWithSessions);

      await service.logoutAllSessions(accountId, UserRole.USER);

      expect(entityWithSessions.sessions).toHaveLength(0);
      expect(entityWithSessions.save).toHaveBeenCalled();
    });
  });

  // ─── revokeAllTokens ──────────────────────────────────────────────────────

  describe('revokeAllTokens()', () => {
    it('increments tokenVersion and clears all sessions', async () => {
      const accountWithVersion = {
        ...mockAccount,
        tokenVersion: 3,
        save: jest.fn().mockResolvedValue(undefined),
      };
      const entityWithSessions = {
        ...mockEntity,
        sessions: [{ sessionId: 'sess-1' }],
        save: jest.fn().mockResolvedValue(undefined),
      };
      authAccountModel.findById.mockResolvedValue(accountWithVersion);
      userModel.findOne.mockResolvedValue(entityWithSessions);

      await service.revokeAllTokens(accountId, UserRole.USER);

      expect(accountWithVersion.tokenVersion).toBe(4);
      expect(entityWithSessions.sessions).toHaveLength(0);
    });
  });

  // ─── getActiveSessions ────────────────────────────────────────────────────

  describe('getActiveSessions()', () => {
    it('returns active sessions for the entity', async () => {
      const sessions = [
        {
          sessionId: 'sess-1',
          isActive: true,
          deviceId: 'dev-1',
          createdAt: new Date(),
          lastActivityAt: new Date(),
        },
        {
          sessionId: 'sess-2',
          isActive: false,
          deviceId: 'dev-2',
          createdAt: new Date(),
          lastActivityAt: new Date(),
        },
      ];
      userModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ ...mockEntity, sessions }),
      });

      const result = await service.getActiveSessions(accountId, UserRole.USER);

      // Only active sessions returned (service already filters by isActive)
      expect(result).toHaveLength(1);
      expect(result[0].sessionId).toBe('sess-1');
    });
  });

  // ─── validateUser ─────────────────────────────────────────────────────────

  describe('validateUser()', () => {
    it('resolves user entity for USER role', async () => {
      authAccountModel.findById.mockResolvedValue(mockAccount);
      userModel.findOne.mockResolvedValue(mockEntity);

      const result = await service.validateUser(accountId);

      expect(result).toBeDefined();
    });

    it('throws UnauthorizedException when account not found', async () => {
      authAccountModel.findById.mockResolvedValue(null);

      await expect(service.validateUser(accountId)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when entity not found', async () => {
      authAccountModel.findById.mockResolvedValue(mockAccount);
      userModel.findOne.mockResolvedValue(null);

      await expect(service.validateUser(accountId)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── getAccount ───────────────────────────────────────────────────────────

  describe('getAccount()', () => {
    it('returns account when found', async () => {
      authAccountModel.findById.mockResolvedValue(mockAccount);

      const result = await service.getAccount(accountId);
      expect(result).toEqual(mockAccount);
    });

    it('returns null when account not found', async () => {
      authAccountModel.findById.mockResolvedValue(null);

      const result = await service.getAccount(accountId);
      expect(result).toBeNull();
    });
  });
});
