import { GhostfolioAuth } from './auth.types';

export interface IGhostfolioClient {
  get<T>(path: string, auth: GhostfolioAuth): Promise<T>;
  post<T>(path: string, body: unknown, auth: GhostfolioAuth): Promise<T>;
  delete<T>(path: string, auth: GhostfolioAuth): Promise<T>;
}
