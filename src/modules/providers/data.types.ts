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
  | { mode: 'created'; periodo: Periodo; offset: number; limit: 100 }
  | { mode: 'updated'; updatedAfter: Date; offset: number; limit: 100 };

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
  fetchOrderDetail(orgId: string, providerOrderId: string): Promise<RawOrderDetail>;
}
