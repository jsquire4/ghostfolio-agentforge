import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';

import { JwtAuthExceptionFilter } from './jwt-auth.exception-filter';

describe('JwtAuthExceptionFilter', () => {
  let filter: JwtAuthExceptionFilter;
  let mockResponse: { status: jest.Mock; json: jest.Mock };

  beforeEach(() => {
    filter = new JwtAuthExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  const createHost = () =>
    ({
      switchToHttp: () => ({
        getResponse: () => mockResponse
      })
    }) as ArgumentsHost;

  it('returns 401 for auth errors', () => {
    filter.catch(new Error('Authorization header is missing'), createHost());
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: 401,
      message: 'Authentication required'
    });
  });

  it('returns 401 for malformed JWT', () => {
    filter.catch(
      new Error('Malformed JWT: expected three segments'),
      createHost()
    );
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
  });

  it('passes through HttpException status', () => {
    filter.catch(
      new HttpException('Not found', HttpStatus.NOT_FOUND),
      createHost()
    );
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });

  it('returns 500 for unexpected errors', () => {
    filter.catch(new Error('Something broke'), createHost());
    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR
    );
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error'
    });
  });

  it('handles non-Error exceptions', () => {
    filter.catch('string error', createHost());
    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR
    );
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error'
    });
  });

  it('returns 401 for Bearer token error messages', () => {
    filter.catch(new Error('Bearer token expired'), createHost());
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: 401,
      message: 'Authentication required'
    });
  });

  it('passes UnauthorizedException through as HttpException with 401', () => {
    const { UnauthorizedException } = jest.requireActual('@nestjs/common');
    filter.catch(new UnauthorizedException('Denied'), createHost());
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 })
    );
  });

  it('preserves HttpException response body (not just status code)', () => {
    const ex = new HttpException(
      { statusCode: 422, message: 'Validation failed', errors: ['bad'] },
      422
    );
    filter.catch(ex, createHost());
    expect(mockResponse.status).toHaveBeenCalledWith(422);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: 422,
      message: 'Validation failed',
      errors: ['bad']
    });
  });
});
