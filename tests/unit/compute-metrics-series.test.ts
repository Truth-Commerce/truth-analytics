import { describe, expect, it } from 'vitest';

import {
  canalPorDia,
  evolucaoDetalhada,
  porDiaSemana,
  ticketPorCanal,
  type OrderRow,
} from '@/modules/pipeline/steps/compute-metrics';

function pedido(iso: string, canal: string, valor: number): OrderRow {
  return { canal, data: new Date(iso), valor_total: valor, itens: [] };
}

// Período de teste: seg 2026-06-01 .. dom 2026-06-14 (14 dias, 2 de cada dia-da-semana)
const PERIODO = { inicio: new Date('2026-06-01T00:00:00Z'), fim: new Date('2026-06-14T23:59:59Z') };

const ORDERS: OrderRow[] = [
  pedido('2026-06-01T10:00:00Z', 'shopee', 100), // seg
  pedido('2026-06-01T15:00:00Z', 'mercadolivre', 200), // seg
  pedido('2026-06-02T10:00:00Z', 'shopee', 50), // ter
  pedido('2026-06-08T10:00:00Z', 'shopee', 300), // seg (2ª ocorrência)
];

describe('evolucaoDetalhada', () => {
  it('agrupa por dia UTC com total e nº de pedidos, ordenado asc', () => {
    expect(evolucaoDetalhada(ORDERS)).toEqual([
      { data: '2026-06-01', total: 300, pedidos: 2 },
      { data: '2026-06-02', total: 50, pedidos: 1 },
      { data: '2026-06-08', total: 300, pedidos: 1 },
    ]);
  });

  it('lista vazia → []', () => {
    expect(evolucaoDetalhada([])).toEqual([]);
  });
});

describe('canalPorDia', () => {
  it('agrupa por dia com um Record canal→total', () => {
    expect(canalPorDia(ORDERS)).toEqual([
      { data: '2026-06-01', canais: { mercadolivre: 200, shopee: 100 } },
      { data: '2026-06-02', canais: { shopee: 50 } },
      { data: '2026-06-08', canais: { shopee: 300 } },
    ]);
  });
});

describe('porDiaSemana', () => {
  it('média = total do dia-da-semana / ocorrências no período (2 segundas → média 300)', () => {
    const r = porDiaSemana(ORDERS, PERIODO);
    const seg = r.find((d) => d.diaSemana === 1);
    expect(seg).toEqual({ diaSemana: 1, label: 'seg', mediaVendas: 300, totalVendas: 600 });
    const ter = r.find((d) => d.diaSemana === 2);
    expect(ter).toEqual({ diaSemana: 2, label: 'ter', mediaVendas: 25, totalVendas: 50 });
  });

  it('ordem comercial seg→dom e inclui dias sem venda (total 0) que ocorrem no período', () => {
    const r = porDiaSemana(ORDERS, PERIODO);
    expect(r.map((d) => d.diaSemana)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    const dom = r.find((d) => d.diaSemana === 0);
    expect(dom).toEqual({ diaSemana: 0, label: 'dom', mediaVendas: 0, totalVendas: 0 });
  });
});

describe('ticketPorCanal', () => {
  it('ticket = total/pedidos por canal, ordenado por ticket desc', () => {
    expect(ticketPorCanal(ORDERS)).toEqual([
      { canal: 'mercadolivre', ticket: 200 },
      { canal: 'shopee', ticket: 150 },
    ]);
  });

  it('lista vazia → []', () => {
    expect(ticketPorCanal([])).toEqual([]);
  });
});
