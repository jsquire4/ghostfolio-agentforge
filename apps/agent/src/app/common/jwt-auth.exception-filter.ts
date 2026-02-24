import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class JwtAuthExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(JwtAuthExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const message =
      exception instanceof Error ? exception.message : String(exception);

    // Check for auth errors from extractUserId()
    const isAuthError =
      /^(Authorization header|Malformed JWT|Bearer token)/i.test(message);

    if (isAuthError) {
      this.logger.warn(`Auth error: ${message}`);
      response.status(HttpStatus.UNAUTHORIZED).json({
        statusCode: 401,
        message: 'Authentication required'
      });
      return;
    }

    // Pass through NestJS HttpExceptions (validation errors, 404s, etc.)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json(body);
      return;
    }

    // Fallback for unexpected errors — never re-throw from a @Catch() filter
    this.logger.error(
      `Unhandled error: ${message}`,
      exception instanceof Error ? exception.stack : undefined
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
}
