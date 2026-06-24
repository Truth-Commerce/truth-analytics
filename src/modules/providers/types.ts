export type OAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scope?: string;
};

export type RawOrderItem = {
  sku?: string;
  nome: string;
  quantidade: number;
  valor: number;
};

export type RawOrder = {
  blingOrderId: string;
  canal: string;
  data: Date;
  valorTotal: number;
  frete: number;
  itens: RawOrderItem[];
};

export type Periodo = {
  inicio: Date;
  fim: Date;
};

export interface ConnectionProvider {
  readonly name: string;
  buildAuthorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<OAuthTokens>;
  refresh(refreshToken: string): Promise<OAuthTokens>;
  fetchOrders(orgId: string, periodo: Periodo): Promise<RawOrder[]>;
}
