import type { ErpProviderId, OAuthTokens } from '@/modules/providers/types';

export type OAuthClientCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type OAuthProviderFailureKind = 'permanent' | 'transient';

export class OAuthProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly kind: OAuthProviderFailureKind,
  ) {
    super(code);
    this.name = 'OAuthProviderError';
  }
}

export interface OAuthConnectionProvider {
  readonly name: ErpProviderId;
  buildAuthorizeUrl(input: {
    credentials: OAuthClientCredentials;
    state: string;
    codeChallenge: string;
  }): string;
  exchangeCode(input: {
    credentials: OAuthClientCredentials;
    code: string;
    codeVerifier: string;
  }): Promise<OAuthTokens>;
  refresh(input: {
    credentials: OAuthClientCredentials;
    refreshToken: string;
    signal?: AbortSignal;
    deadlineAt?: number;
  }): Promise<OAuthTokens>;
}
