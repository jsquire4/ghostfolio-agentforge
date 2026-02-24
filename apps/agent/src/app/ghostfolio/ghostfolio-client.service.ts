import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  IGhostfolioClient,
  GhostfolioAuth,
  UserAuth
} from '../common/interfaces';

export class GhostfolioClientError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly path: string
  ) {
    super(message);
    this.name = 'GhostfolioClientError';
  }
}

@Injectable()
export class GhostfolioClientService implements IGhostfolioClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private cachedServiceJwt: string | null = null;
  private serviceJwtExpiresAt: number = 0;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>(
      'GHOSTFOLIO_BASE_URL',
      'http://localhost:3333'
    );
    this.apiToken = config.get<string>('GHOSTFOLIO_API_TOKEN', '');
  }

  async get<T>(path: string, auth: GhostfolioAuth): Promise<T> {
    return this.request<T>('GET', path, undefined, auth);
  }

  async post<T>(path: string, body: unknown, auth: GhostfolioAuth): Promise<T> {
    return this.request<T>('POST', path, body, auth);
  }

  async delete<T>(path: string, auth: GhostfolioAuth): Promise<T> {
    return this.request<T>('DELETE', path, undefined, auth);
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown | undefined,
    auth: GhostfolioAuth
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (auth.mode === 'user') {
      headers['Authorization'] = `Bearer ${(auth as UserAuth).jwt}`;
    } else {
      const jwt = await this.getServiceJwt();
      headers['Authorization'] = `Bearer ${jwt}`;
    }

    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(10000)
    };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    if (!response.ok) {
      // If service auth got a 401, clear cached JWT and retry once
      if (response.status === 401 && auth.mode === 'service') {
        this.cachedServiceJwt = null;
        this.serviceJwtExpiresAt = 0;
        const retryJwt = await this.getServiceJwt();
        headers['Authorization'] = `Bearer ${retryJwt}`;
        const retryResponse = await fetch(url, { ...options, headers });
        if (!retryResponse.ok) {
          throw new GhostfolioClientError(
            retryResponse.status,
            await retryResponse.text(),
            path
          );
        }
        return retryResponse.json() as Promise<T>;
      }
      throw new GhostfolioClientError(
        response.status,
        await response.text(),
        path
      );
    }
    return response.json() as Promise<T>;
  }

  private async getServiceJwt(): Promise<string> {
    if (this.cachedServiceJwt && Date.now() < this.serviceJwtExpiresAt) {
      return this.cachedServiceJwt;
    }

    const url = `${this.baseUrl}/api/v1/auth/anonymous`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: this.apiToken }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new GhostfolioClientError(
        response.status,
        'Failed to exchange service token',
        '/api/v1/auth/anonymous'
      );
    }

    const data = (await response.json()) as { authToken: string };
    this.cachedServiceJwt = data.authToken;
    // Conservative 24h cache (actual expiry is 180 days)
    this.serviceJwtExpiresAt = Date.now() + 24 * 60 * 60 * 1000;
    return this.cachedServiceJwt;
  }
}
