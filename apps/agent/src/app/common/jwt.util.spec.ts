import { buildBearerHeader, extractUserId } from './jwt.util';

// Pre-computed base64 payloads used to build synthetic JWTs.
// Each payload is Base64(JSON.stringify(object)) — no padding stripped so
// Buffer.from(..., 'base64') can decode them without ambiguity.
//
//   Buffer.from(JSON.stringify({ id: 'test-user-123' })).toString('base64')
//   => 'eyJpZCI6InRlc3QtdXNlci0xMjMifQ=='
//
//   Buffer.from(JSON.stringify({ sub: 'test-user-123' })).toString('base64')
//   => 'eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIn0='
//
//   Buffer.from(JSON.stringify({ name: 'no-id-field' })).toString('base64')
//   => 'eyJuYW1lIjoibm8taWQtZmllbGQifQ=='

const HEADER_SEGMENT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
const SIGNATURE_SEGMENT = 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

const PAYLOAD_WITH_ID = 'eyJpZCI6InRlc3QtdXNlci0xMjMifQ==';
const PAYLOAD_WITH_SUB_ONLY = 'eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIn0=';
const PAYLOAD_NO_ID_FIELD = 'eyJuYW1lIjoibm8taWQtZmllbGQifQ==';

const VALID_JWT = `${HEADER_SEGMENT}.${PAYLOAD_WITH_ID}.${SIGNATURE_SEGMENT}`;
const JWT_SUB_ONLY = `${HEADER_SEGMENT}.${PAYLOAD_WITH_SUB_ONLY}.${SIGNATURE_SEGMENT}`;
const JWT_NO_ID = `${HEADER_SEGMENT}.${PAYLOAD_NO_ID_FIELD}.${SIGNATURE_SEGMENT}`;

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

  it('throws when the JWT has no dot separators (single segment)', () => {
    const authHeader = 'Bearer notadottedjwtatall';
    expect(() => extractUserId(authHeader)).toThrow(
      'Malformed JWT: expected three dot-separated segments'
    );
  });

  it('throws when the JWT has only two segments (missing signature)', () => {
    const authHeader = `Bearer ${HEADER_SEGMENT}.${PAYLOAD_WITH_ID}`;
    expect(() => extractUserId(authHeader)).toThrow(
      'Malformed JWT: expected three dot-separated segments'
    );
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

  it('throws when the header does not use the Bearer scheme', () => {
    const authHeader = `Basic dXNlcjpwYXNz`;
    expect(() => extractUserId(authHeader)).toThrow(
      'Authorization header must use Bearer scheme'
    );
  });

  it('throws when the header is "Bearer" with no token following it', () => {
    // "Bearer " prefix present but no JWT segments
    const authHeader = 'Bearer ';
    expect(() => extractUserId(authHeader)).toThrow(
      'Malformed JWT: expected three dot-separated segments'
    );
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
