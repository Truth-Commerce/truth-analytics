export type OAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scope?: string;
};

export interface ConnectionProvider {
  readonly name: string;
  buildAuthorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<OAuthTokens>;
  refresh(refreshToken: string): Promise<OAuthTokens>;
}
