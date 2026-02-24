export function extractUserId(authHeader: string): {
  userId: string;
  rawJwt: string;
} {
  if (!authHeader) {
    throw new Error('Authorization header is missing');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Authorization header must use Bearer scheme');
  }

  const rawJwt = authHeader.slice('Bearer '.length);
  const segments = rawJwt.split('.');

  if (segments.length !== 3) {
    throw new Error('Malformed JWT: expected three dot-separated segments');
  }

  const payloadSegment = segments[1];

  let payloadJson: string;
  try {
    payloadJson = Buffer.from(payloadSegment, 'base64').toString('utf8');
  } catch {
    throw new Error('Malformed JWT: payload segment is not valid base64');
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    throw new Error('Malformed JWT: payload segment is not valid JSON');
  }

  if (typeof payload['id'] !== 'string' || payload['id'] === '') {
    throw new Error(
      'Malformed JWT: payload is missing the required `id` field'
    );
  }

  return { userId: payload['id'], rawJwt };
}

export function buildBearerHeader(jwt: string): string {
  return `Bearer ${jwt}`;
}
