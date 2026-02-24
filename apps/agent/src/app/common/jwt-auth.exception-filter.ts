import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Global exception filter that catches JWT extraction errors from extractUserId()
 * and returns a consistent 401 response. Registered as APP_FILTER in AppModule.
 *
 * Any error whose message includes 'Authorization', 'JWT', 'token', or 'Bearer'
 * (case-insensitive) is treated as an auth error → 401.
 * All other errors are re-thrown for NestJS default handling.
 */
@Catch()
export class JwtAuthExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(JwtAuthExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const message =
      exception instanceof Error ? exception.message : String(exception);

    const isAuthError = /authorization|jwt|token|bearer/i.test(message);

    if (isAuthError) {
      this.logger.warn(`Auth error: ${message}`);
      response.status(HttpStatus.UNAUTHORIZED).json({
        statusCode: 401,
        message: 'Authentication required'
      });
      return;
    }

    // Re-throw non-auth errors for default NestJS handling
    throw exception;
  }
}
