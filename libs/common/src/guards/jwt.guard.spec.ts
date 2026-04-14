import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

// Mock AuthGuard before importing JwtAuthGuard
const mockCanActivate = jest.fn().mockReturnValue(true);

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () => {
    class MockAuthGuard {
      canActivate = mockCanActivate;
    }
    return MockAuthGuard;
  },
}));

import { JwtAuthGuard } from './jwt.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(guard).toBeDefined();
    });

    it('should have canActivate and handleRequest methods', () => {
      expect(typeof guard.canActivate).toBe('function');
      expect(typeof guard.handleRequest).toBe('function');
    });
  });

  describe('canActivate', () => {
    it('should call super.canActivate with the execution context', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
          getResponse: () => ({}),
        }),
        getHandler: () => jest.fn(),
        getClass: () => jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockContext);

      expect(mockCanActivate).toHaveBeenCalledWith(mockContext);
      expect(result).toBe(true);
    });
  });

  describe('handleRequest', () => {
    it('should return the user when user is valid and no error', () => {
      const mockUser = { id: '123', email: 'test@test.com', role: 'user' };
      const result = guard.handleRequest(null, mockUser);
      expect(result).toBe(mockUser);
    });

    it('should throw UnauthorizedException when user is falsy (null)', () => {
      expect(() => guard.handleRequest(null, null)).toThrow(
        UnauthorizedException,
      );
      expect(() => guard.handleRequest(null, null)).toThrow(
        'Invalid or expired access token',
      );
    });

    it('should throw UnauthorizedException when user is undefined', () => {
      expect(() => guard.handleRequest(null, undefined)).toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for non-HttpException errors', () => {
      const customError = new Error('Custom auth error');
      expect(() => guard.handleRequest(customError, { id: '1' })).toThrow(
        UnauthorizedException,
      );
      expect(() => guard.handleRequest(customError, { id: '1' })).toThrow(
        'Invalid or expired access token',
      );
    });

    it('should throw the original error even if user exists', () => {
      const customError = new UnauthorizedException('Token revoked');
      expect(() =>
        guard.handleRequest(customError, { id: '1', role: 'admin' }),
      ).toThrow('Token revoked');
    });

    it('should throw UnauthorizedException when non-HttpException error and no user', () => {
      const customError = new Error('Strategy error');
      expect(() => guard.handleRequest(customError, null)).toThrow(
        UnauthorizedException,
      );
      expect(() => guard.handleRequest(customError, null)).toThrow(
        'Invalid or expired access token',
      );
    });

    it('should throw UnauthorizedException with default message when user is false', () => {
      expect(() => guard.handleRequest(null, false)).toThrow(
        'Invalid or expired access token',
      );
    });
  });
});
