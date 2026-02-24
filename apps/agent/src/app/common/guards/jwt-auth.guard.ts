import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthUser } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { extractUserId } from '../jwt.util';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: AuthUser;
    }>();
    try {
      const { userId, rawJwt } = extractUserId(
        request.headers.authorization ?? ''
      );
      request.user = { userId, rawJwt };
      return true;
    } catch {
      throw new UnauthorizedException('Authentication required');
    }
  }
}
