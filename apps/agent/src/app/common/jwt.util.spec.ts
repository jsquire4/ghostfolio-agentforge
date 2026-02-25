import { sign } from 'jsonwebtoken';

import { buildBearerHeader, extractUserId } from './jwt.util';

const TEST_SECRET = 'test-secret-key-for-unit-tests';

beforeAll(() => {
  process.env.JWT_SECRET_KEY = TEST_SECRET;
});

afterAll(() => {
  delete process.env.JWT_SECRET_KEY;
});

function signToken(payload: object): string {
  return sign(payload, TEST_SECRET);
}

const VALID_JWT = signToken({ id: 'test-user-123' });
const JWT_SUB_ONLY = signToken({ sub: 'test-user-123' });
const JWT_NO_ID = signToken({ name: 'no-id-field' });

describe('extractUserId', () => {
  it('returns correct userId and rawJwt for a valid Bearer token', () => {
    const authHeader = `Bearer ${VALID_JWT}`;
    const result = extractUserId(authHeader);

    expect(result.userId).toBe('test-user-123');
    expect(result.rawJwt).toBe(VALID_JWT);
  });

  it('throws when the authorization header is an empty string', () => {
    expect(() => extractUserId('')).toThrow('Authorization header is missing');
  });

  it('throws when the header does not use the Bearer scheme', () => {
    const authHeader = `Basic dXNlcjpwYXNz`;
    expect(() => extractUserId(authHeader)).toThrow(
      'Authorization header must use Bearer scheme'
    );
  });

  it('throws when the header is "Bearer" with no token following it', () => {
    const authHeader = 'Bearer ';
    expect(() => extractUserId(authHeader)).toThrow();
  });

  it('throws when the payload has no `id` field (sub-only payload)', () => {
    const authHeader = `Bearer ${JWT_SUB_ONLY}`;
    expect(() => extractUserId(authHeader)).toThrow(
      'Malformed JWT: payload is missing the required `id` field'
    );
  });

  it('throws when the payload contains neither `id` nor `sub`', () => {
    const authHeader = `Bearer ${JWT_NO_ID}`;
    expect(() => extractUserId(authHeader)).toThrow(
      'Malformed JWT: payload is missing the required `id` field'
    );
  });

  it('throws when id field is empty string', () => {
    const jwt = signToken({ id: '' });
    expect(() => extractUserId(`Bearer ${jwt}`)).toThrow(
      'Malformed JWT: payload is missing the required `id` field'
    );
  });

  it('rejects tokens signed with a wrong secret', () => {
    const badJwt = sign({ id: 'test-user-123' }, 'wrong-secret');
    expect(() => extractUserId(`Bearer ${badJwt}`)).toThrow();
  });

  it('rejects tampered tokens', () => {
    const tampered = VALID_JWT.replace(/.$/, 'X');
    expect(() => extractUserId(`Bearer ${tampered}`)).toThrow();
  });

  it('throws when JWT_SECRET_KEY is not configured', () => {
    const saved = process.env.JWT_SECRET_KEY;
    delete process.env.JWT_SECRET_KEY;
    try {
      expect(() => extractUserId(`Bearer ${VALID_JWT}`)).toThrow(
        'JWT_SECRET_KEY not configured'
      );
    } finally {
      process.env.JWT_SECRET_KEY = saved;
    }
  });
});

describe('buildBearerHeader', () => {
  it('prepends "Bearer " to the supplied JWT string', () => {
    expect(buildBearerHeader(VALID_JWT)).toBe(`Bearer ${VALID_JWT}`);
  });

  it('works with an arbitrary non-JWT string', () => {
    expect(buildBearerHeader('sometoken')).toBe('Bearer sometoken');
  });
});
