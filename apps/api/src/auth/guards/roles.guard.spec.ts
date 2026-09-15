import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

function buildContext(user: any, requiredRoles: Role[] | undefined): ExecutionContext {
  return {
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();
    guard = module.get(RolesGuard);
    reflector = module.get(Reflector);
  });

  function mockRoles(roles: Role[] | undefined) {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);
  }

  describe('when no roles are required', () => {
    it('allows any authenticated user', () => {
      mockRoles(undefined);
      const ctx = buildContext({ role: Role.DEPT_USER }, undefined);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows even when user is absent', () => {
      mockRoles([]);
      const ctx = buildContext(undefined, []);
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('when ADMIN role is required', () => {
    beforeEach(() => mockRoles([Role.ADMIN]));

    it('allows ADMIN', () => {
      const ctx = buildContext({ role: Role.ADMIN }, [Role.ADMIN]);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('blocks OFFICER', () => {
      const ctx = buildContext({ role: Role.OFFICER }, [Role.ADMIN]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('blocks DEPT_USER', () => {
      const ctx = buildContext({ role: Role.DEPT_USER }, [Role.ADMIN]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('blocks missing user', () => {
      const ctx = buildContext(undefined, [Role.ADMIN]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('when ADMIN or OFFICER role is required', () => {
    beforeEach(() => mockRoles([Role.ADMIN, Role.OFFICER]));

    it('allows ADMIN', () => {
      const ctx = buildContext({ role: Role.ADMIN }, [Role.ADMIN, Role.OFFICER]);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows OFFICER', () => {
      const ctx = buildContext({ role: Role.OFFICER }, [Role.ADMIN, Role.OFFICER]);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('blocks DEPT_USER', () => {
      const ctx = buildContext({ role: Role.DEPT_USER }, [Role.ADMIN, Role.OFFICER]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('ForbiddenException message', () => {
    it('includes "Insufficient permissions"', () => {
      mockRoles([Role.ADMIN]);
      const ctx = buildContext({ role: Role.DEPT_USER }, [Role.ADMIN]);
      try {
        guard.canActivate(ctx);
        fail('Expected ForbiddenException');
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenException);
        expect((e as ForbiddenException).message).toContain('Insufficient permissions');
      }
    });
  });
});
