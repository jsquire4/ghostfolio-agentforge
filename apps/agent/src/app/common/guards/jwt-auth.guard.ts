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
      query?: { token?: string };
      url?: string;
      user?: AuthUser;
    }>();
    try {
      const authHeader = request.headers.authorization ?? '';

      // JWT in query param is an SSE workaround (EventSource can't set headers).
      // Limited to /evals/stream to reduce token exposure in logs.
      const isSseEndpoint = request.url?.includes('/evals/stream');
      const queryToken = isSseEndpoint ? (request.query?.token ?? '') : '';

      const bearer = authHeader || (queryToken ? `Bearer ${queryToken}` : '');
      const { userId, rawJwt } = extractUserId(bearer);
      request.user = { userId, rawJwt };
      return true;
    } catch {
      throw new UnauthorizedException('Authentication required');
    }
  }
}
