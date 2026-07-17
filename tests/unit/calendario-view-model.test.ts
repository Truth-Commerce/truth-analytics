import { describe, expect, it } from 'vitest';

import { proximasDatas } from '@/lib/calendario-comercial';
import type { DataComercial } from '@/lib/calendario-comercial';
import {
  agruparPorData,
  badgeContagem,
  inicioDoDiaUtc,
  labelContagem,
  statusSugestaoBadge,
  sugestaoView,
} from '@/modules/calendario/calendario-view-model';

const base = {
  id: 's1',
  org_id: 'o1',
  report_id: 'r1',
  titulo: 'Anuncie a Black Friday',
  status: 'sugerido',
  task_id: null,
  created_at: new Date(),
  payload: {
    dataISO: '2026-11-27',
    nomeData: 'Black Friday',
    sugestao: 'Destaque frete grátis e prepare estoque com 30 dias de antecedência.',
    skus: ['SKU1', 'SKU2'],
  },
};

describe('sugestaoView', () => {
  it('normaliza payload completo', () => {
    const v = sugestaoView(base as never);
    expect(v).toMatchObject({
      id: 's1',
      titulo: 'Anuncie a Black Friday',
      dataISO: '2026-11-27',
      nomeData: 'Black Friday',
      status: 'sugerido',
    });
    expect(v.skus).toEqual(['SKU1', 'SKU2']);
  });

  it('payload malformado não quebra (defaults seguros)', () => {
    const v = sugestaoView({ ...base, payload: {} } as never);
    expect(v.dataISO).toBe('');
    expect(v.nomeData).toBe('');
    expect(v.sugestao).toBe('');
    expect(v.skus).toEqual([]);
  });
});

describe('agruparPorData', () => {
  const datas: DataComercial[] = [
    { nome: 'Data de hoje', data: new Date(Date.UTC(2026, 6, 17)), dica: 'dica hoje' },
    { nome: 'Data de amanhã', data: new Date(Date.UTC(2026, 6, 18)), dica: 'dica amanhã' },
    { nome: 'Data futura', data: new Date(Date.UTC(2026, 7, 1)), dica: 'dica futura' },
  ];
  const hoje = new Date(Date.UTC(2026, 6, 17));

  it('casa sugestão por dataISO', () => {
    const sug = sugestaoView({
      ...base,
      payload: { ...base.payload, dataISO: '2026-07-17' },
    } as never);
    const timeline = agruparPorData([sug], datas, hoje);
    expect(timeline).toHaveLength(3);
    expect(timeline[0]!.dataISO).toBe('2026-07-17');
    expect(timeline[0]!.sugestoes).toHaveLength(1);
    expect(timeline[0]!.sugestoes[0]!.id).toBe('s1');
  });

  it('data sem sugestão vem com lista vazia (mas presente na timeline com a dica geral)', () => {
    const timeline = agruparPorData([], datas, hoje);
    expect(timeline).toHaveLength(3);
    expect(timeline[1]!.sugestoes).toEqual([]);
    expect(timeline[1]!.dica).toBe('dica amanhã');
  });

  it('payload sem sugestão para a data casada não quebra a timeline (nenhum item casa)', () => {
    const sug = sugestaoView({
      ...base,
      payload: { ...base.payload, dataISO: '2099-01-01' },
    } as never);
    const timeline = agruparPorData([sug], datas, hoje);
    expect(timeline.every((t) => t.sugestoes.length === 0)).toBe(true);
  });

  it('faltamDias calculado por diferença UTC-midnight', () => {
    const timeline = agruparPorData([], datas, hoje);
    expect(timeline[0]!.faltamDias).toBe(0);
    expect(timeline[1]!.faltamDias).toBe(1);
    expect(timeline[2]!.faltamDias).toBe(15);
  });
});

describe('labelContagem', () => {
  it('hoje/amanhã/N dias', () => {
    expect(labelContagem(0)).toBe('é hoje!');
    expect(labelContagem(1)).toBe('amanhã');
    expect(labelContagem(5)).toBe('faltam 5 dias');
    expect(labelContagem(90)).toBe('faltam 90 dias');
  });
});

describe('badgeContagem', () => {
  it('mapeia urgência → variant real do Badge', () => {
    expect(badgeContagem(0)).toEqual({ variant: 'danger', label: 'é hoje!' });
    expect(badgeContagem(7)).toEqual({ variant: 'danger', label: 'faltam 7 dias' });
    expect(badgeContagem(8)).toEqual({ variant: 'warn', label: 'faltam 8 dias' });
    expect(badgeContagem(21)).toEqual({ variant: 'warn', label: 'faltam 21 dias' });
    expect(badgeContagem(22)).toEqual({ variant: 'success', label: 'faltam 22 dias' });
  });
});

describe('statusSugestaoBadge', () => {
  it('mapeia status → variant + rótulo pt-BR', () => {
    expect(statusSugestaoBadge('sugerido')).toEqual({ variant: 'success', label: 'Sugerido' });
    expect(statusSugestaoBadge('virou_task')).toEqual({ variant: 'neutral', label: 'Virou tarefa' });
    expect(statusSugestaoBadge('descartado')).toEqual({ variant: 'neutral', label: 'Descartado' });
  });
});

describe('inicioDoDiaUtc', () => {
  it('trunca um instante às 15h UTC para meia-noite UTC do mesmo dia', () => {
    const natalAs15hUtc = new Date(Date.UTC(2026, 11, 25, 15, 0, 0));
    const truncado = inicioDoDiaUtc(natalAs15hUtc);
    expect(truncado.toISOString()).toBe('2026-12-25T00:00:00.000Z');
  });
});

describe('"hoje" no dia da data comercial não desaparece da timeline (regressão)', () => {
  it('com hoje normalizado, proximasDatas inclui o Natal e a timeline mostra "é hoje!"', () => {
    // Instante tardio no dia do Natal — sem normalizar, `>= aPartirDe` no
    // filtro de proximasDatas excluiria o próprio Natal (getTime() do Natal
    // é meia-noite UTC, menor que 15h UTC do mesmo dia).
    const natalAs15hUtc = new Date(Date.UTC(2026, 11, 25, 15, 0, 0));
    const hoje = inicioDoDiaUtc(natalAs15hUtc);

    const datas = proximasDatas(hoje, 90);
    const natal = datas.find((d) => d.nome === 'Natal');
    expect(natal).toBeDefined();
    expect(natal!.data.toISOString()).toBe('2026-12-25T00:00:00.000Z');

    const timeline = agruparPorData([], datas, hoje);
    const entradaNatal = timeline.find((t) => t.nome === 'Natal');
    expect(entradaNatal).toBeDefined();
    expect(entradaNatal!.faltamDias).toBe(0);
    expect(labelContagem(entradaNatal!.faltamDias)).toBe('é hoje!');
  });
});
