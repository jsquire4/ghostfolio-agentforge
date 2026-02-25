import { verify } from 'jsonwebtoken';

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

  const secret = process.env.JWT_SECRET_KEY;
  if (!secret) {
    throw new Error('JWT_SECRET_KEY not configured');
  }

  const payload = verify(rawJwt, secret) as Record<string, unknown>;

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
