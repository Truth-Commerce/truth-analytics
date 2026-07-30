export type OAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  refreshExpiresInSeconds?: number;
  scope?: string;
};
export type OAuthRequestContext = { deadlineAt?: number };

/** @deprecated Use RawOrderItem from data.types in new operational adapters. */
export type RawOrderItem = {
  sku?: string;
  nome: string;
  quantidade: number;
  valor: number;
};

/** @deprecated Use RawOrder from data.types in new operational adapters. */
export type RawOrder = {
  blingOrderId: string;
  canal: string;
  data: Date;
  valorTotal: number;
  frete: number;
  itens: RawOrderItem[];
};

export type RawStockItem = {
  sku?: string;
  nome: string;
  saldo: number;
};

export type ErpProviderId = 'bling' | 'olist';

/** @deprecated Use Periodo from data.types in new operational adapters. */
export type Periodo = {
  inicio: Date;
  fim: Date;
};

/** @deprecated OAuth and operational data adapters are now registered separately. */
export interface ConnectionProvider {
  readonly name: ErpProviderId;
  buildAuthorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<OAuthTokens>;
  refresh(refreshToken: string, context?: OAuthRequestContext): Promise<OAuthTokens>;
  fetchOrders(
    orgId: string,
    periodo: Periodo,
    onPage?: (pagina: RawOrder[]) => Promise<void>,
  ): Promise<RawOrder[]>;
  fetchStock(orgId: string): Promise<RawStockItem[]>;
}
