export interface UserAuth {
  mode: 'user';
  jwt: string;
}

export interface ServiceAuth {
  mode: 'service';
  token: string;
}

export type GhostfolioAuth = UserAuth | ServiceAuth;

export interface AuthUser {
  userId: string;
  rawJwt: string;
}
