import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { JwtAuthGuard } from './jwt-auth.guard';

jest.mock('../jwt.util', () => ({
  extractUserId: jest.fn()
}));

const { extractUserId } = jest.requireMock('../jwt.util');

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  const createContext = (authHeader?: string) => {
    const request = { headers: { authorization: authHeader }, user: undefined };
    return {
      switchToHttp: () => ({
        getRequest: () => request
      }),
      getHandler: () => ({}),
      getClass: () => ({})
    } as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
    jest.clearAllMocks();
  });

  it('allows when route is public', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const ctx = createContext();
    expect(guard.canActivate(ctx)).toBe(true);
    expect(extractUserId).not.toHaveBeenCalled();
  });

  it('sets user and returns true when JWT valid', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    extractUserId.mockReturnValue({ userId: 'user-1', rawJwt: 'jwt-token' });
    const ctx = createContext('Bearer jwt-token');
    const request = ctx.switchToHttp().getRequest();

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.user).toEqual({ userId: 'user-1', rawJwt: 'jwt-token' });
  });

  it('throws UnauthorizedException when extractUserId throws', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    extractUserId.mockImplementation(() => {
      throw new Error('Invalid JWT');
    });
    const ctx = createContext('Bearer invalid');

    expect(() => guard.canActivate(ctx)).toThrow('Authentication required');
  });

  it('throws UnauthorizedException instance (not generic Error)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    extractUserId.mockImplementation(() => {
      throw new Error('bad');
    });
    const ctx = createContext('Bearer bad');
    try {
      guard.canActivate(ctx);
      fail('Expected UnauthorizedException');
    } catch (e) {
      expect(e).toBeInstanceOf(UnauthorizedException);
    }
  });

  it('passes full authorization header to extractUserId', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    extractUserId.mockReturnValue({ userId: 'u1', rawJwt: 'jwt-token' });
    const ctx = createContext('Bearer jwt-token');
    guard.canActivate(ctx);
    expect(extractUserId).toHaveBeenCalledWith('Bearer jwt-token');
  });

  it('throws when authorization header is undefined', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    extractUserId.mockImplementation(() => {
      throw new Error('missing');
    });
    const ctx = createContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow('Authentication required');
  });

  it('falls through to JWT validation when isPublic is undefined', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    extractUserId.mockReturnValue({ userId: 'u1', rawJwt: 'jwt' });
    const ctx = createContext('Bearer jwt');
    expect(guard.canActivate(ctx)).toBe(true);
    expect(extractUserId).toHaveBeenCalled();
  });
});
