const fixturePayload = { id: 'fixture-user-1' };
const encodedPayload = Buffer.from(JSON.stringify(fixturePayload)).toString(
  'base64'
);
const fakeHeader = Buffer.from(
  JSON.stringify({ alg: 'HS256', typ: 'JWT' })
).toString('base64');
const fakeSignature = 'fake-signature';

export const validJwt = `${fakeHeader}.${encodedPayload}.${fakeSignature}`;
export const validAuthHeader = `Bearer ${validJwt}`;
export const fixtureUserId = 'fixture-user-1';

const noIdPayload = { sub: 'some-sub-value', name: 'Test User' };
const encodedNoIdPayload = Buffer.from(JSON.stringify(noIdPayload)).toString(
  'base64'
);
export const jwtWithoutId = `${fakeHeader}.${encodedNoIdPayload}.${fakeSignature}`;
