import type { ErpProviderId } from '@/modules/providers/types';

export type RawOrderItem = {
  sku?: string;
  nome: string;
  quantidade: number;
  valor: number;
};

export type RawOrder = {
  providerOrderId: string;
  providerStatus: string;
  canal: string;
  data: Date;
  valorTotal: number;
  frete: number;
  itens: RawOrderItem[];
};

export type RawOrderDetail = {
  itens: RawOrderItem[];
  frete: number;
  comissao: number;
  canal?: string;
};

/** Deadline propagated from bounded pipeline work into provider retries/governors. */
export type OrderDetailRequestContext = {
  deadlineAt: number;
  /** Reused by the Bling adapter so a run does not fetch channels per order. */
  blingToken?: string;
  blingChannels?: ReadonlyMap<string, string>;
  blingState?: { token: string; refreshPromise?: Promise<string> };
};

export type Periodo = {
  inicio: Date;
  fim: Date;
};

export type ErpDataSource = {
  orgId: string;
  provider: ErpProviderId;
  sourceGeneration: number;
};

export type OrderPageRequest =
  | { mode: 'created'; periodo: Periodo; offset: number; limit: 100; deadlineAt?: number }
  | { mode: 'updated'; updatedAfter: Date; offset: number; limit: 100; deadlineAt?: number };

export type OrderPage = {
  orders: RawOrder[];
  offset: number;
  nextOffset: number;
  total: number;
  done: boolean;
};

export type OrderPageHandler = (page: OrderPage) => Promise<void>;

export interface ErpDataProvider {
  readonly name: ErpProviderId;
  fetchOrders(orgId: string, request: OrderPageRequest, onPage: OrderPageHandler): Promise<void>;
  fetchOrderDetail(orgId: string, providerOrderId: string, context?: OrderDetailRequestContext): Promise<RawOrderDetail>;
}
