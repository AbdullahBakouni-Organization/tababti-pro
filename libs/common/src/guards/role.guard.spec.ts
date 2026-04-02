import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './role.guard';
import { UserRole } from '@app/common/database/schemas/common.enums';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const createMockContext = (
    user?: Record<string, unknown>,
  ): ExecutionContext => {
    const mockHandler = jest.fn();
    const mockClass = jest.fn();
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => mockHandler,
      getClass: () => mockClass,
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
    guard = new RolesGuard(reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow access when no roles are required (undefined)', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
      const context = createMockContext();

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when required roles array is empty', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([]);
      const context = createMockContext();

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when user has the required role', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        UserRole.ADMIN,
      ]);
      const context = createMockContext({
        id: '123',
        role: UserRole.ADMIN,
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when user role matches one of multiple required roles', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        UserRole.ADMIN,
        UserRole.DOCTOR,
      ]);
      const context = createMockContext({
        id: '123',
        role: UserRole.DOCTOR,
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should throw ForbiddenException when user role does not match', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        UserRole.ADMIN,
      ]);
      const context = createMockContext({
        id: '123',
        role: UserRole.USER,
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'Insufficient role permissions',
      );
    });

    it('should throw ForbiddenException when user is missing from request', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        UserRole.ADMIN,
      ]);
      const context = createMockContext(undefined);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'User role not found in request',
      );
    });

    it('should throw ForbiddenException when user has no role property', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        UserRole.ADMIN,
      ]);
      const context = createMockContext({ id: '123' });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'User role not found in request',
      );
    });

    it('should call reflector.getAllAndOverride with ROLES_KEY and correct targets', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
      const context = createMockContext();

      guard.canActivate(context);

      expect(reflector.getAllAndOverride).toHaveBeenCalledWith('roles', [
        context.getHandler(),
        context.getClass(),
      ]);
    });

    it('should deny access for HOSPITAL role when only ADMIN is required', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        UserRole.ADMIN,
      ]);
      const context = createMockContext({
        id: '456',
        role: UserRole.HOSPITAL,
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should allow SYSTEM role when SYSTEM is in required roles', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        UserRole.SYSTEM,
        UserRole.ADMIN,
      ]);
      const context = createMockContext({
        id: '789',
        role: UserRole.SYSTEM,
      });

      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
