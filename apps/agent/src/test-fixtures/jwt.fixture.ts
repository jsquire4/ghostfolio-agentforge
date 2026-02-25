import { sign } from 'jsonwebtoken';

// Test fixtures use a well-known secret; set JWT_SECRET_KEY in test setup.
export const FIXTURE_JWT_SECRET = 'fixture-jwt-secret-for-tests';

const fixturePayload = { id: 'fixture-user-1' };
export const validJwt = sign(fixturePayload, FIXTURE_JWT_SECRET);
export const validAuthHeader = `Bearer ${validJwt}`;
export const fixtureUserId = 'fixture-user-1';

const noIdPayload = { sub: 'some-sub-value', name: 'Test User' };
export const jwtWithoutId = sign(noIdPayload, FIXTURE_JWT_SECRET);
