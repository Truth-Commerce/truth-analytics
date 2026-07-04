import { describe, expect, it } from 'vitest';

import { PRIORIDADE_LABEL, recomendacaoCards } from '@/modules/reports/report-view-model';
import type { AnaliseIa } from '@/modules/pipeline/contracts';

const ANALISE: AnaliseIa = {
  resumoExecutivo: 'ok',
  gargalos: ['Frete caro'],
  sugestoesMelhoria: ['Negociar tarifa'],
  ideiasVenda: ['Kit promocional'],
  recomendacoesPreco: [],
};

describe('report-view-model', () => {
  it('deriva prioridade por origem: gargalo=alta, sugestão=média, ideia=baixa', () => {
    expect(recomendacaoCards(ANALISE)).toEqual([
      { texto: 'Frete caro', prioridade: 'alta', origem: 'gargalo' },
      { texto: 'Negociar tarifa', prioridade: 'media', origem: 'sugestao' },
      { texto: 'Kit promocional', prioridade: 'baixa', origem: 'ideia' },
    ]);
  });

  it('labels pt-BR das prioridades', () => {
    expect(PRIORIDADE_LABEL).toEqual({ alta: 'Alta', media: 'Média', baixa: 'Baixa' });
  });
});
