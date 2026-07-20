import { describe, expect, it } from 'vitest';

import { dividirPorMencoes, extrairMencoes, handleFromEmail } from '@/modules/tasks/mencoes';

describe('extrairMencoes', () => {
  it('extrai um handle simples', () => {
    expect(extrairMencoes('Oi @financeiro, tudo bem?')).toEqual(['financeiro']);
  });

  it('lowercase + dedup, preservando ordem de primeira ocorrência', () => {
    expect(extrairMencoes('@Financeiro e @COMERCIAL, confirmem. @financeiro de novo')).toEqual([
      'financeiro',
      'comercial',
    ]);
  });

  it('texto sem menções devolve []', () => {
    expect(extrairMencoes('sem menções aqui')).toEqual([]);
    expect(extrairMencoes('')).toEqual([]);
  });

  it('ignora email completo (local-part precedido de char de palavra antes do @, não é menção)', () => {
    expect(extrairMencoes('mande pro email financeiro@bazarmattos.com.br por favor')).toEqual([]);
  });

  it('handle no início da string ou após parênteses conta como menção', () => {
    expect(extrairMencoes('@financeiro confirma isso')).toEqual(['financeiro']);
    expect(extrairMencoes('(@financeiro) pode confirmar?')).toEqual(['financeiro']);
  });

  it('remove pontuação de fim de frase (ponto final) do handle capturado', () => {
    expect(extrairMencoes('cc @ana.paula por favor.')).toEqual(['ana.paula']);
    expect(extrairMencoes('confirma @financeiro.')).toEqual(['financeiro']);
  });

  it('@ seguido de espaço (sem handle colado) não é menção', () => {
    expect(extrairMencoes('@ isso não é menção')).toEqual([]);
  });

  it('vírgula finaliza o handle (não entra na captura)', () => {
    expect(extrairMencoes('@financeiro, @comercial: confirmem')).toEqual(['financeiro', 'comercial']);
  });
});

describe('handleFromEmail', () => {
  it('extrai a parte local do e-mail em minúsculas', () => {
    expect(handleFromEmail('Financeiro@Bazarmattos.com.br')).toBe('financeiro');
    expect(handleFromEmail('comercial@example.com')).toBe('comercial');
  });
});

describe('dividirPorMencoes (H5/T5 — insumo do destaque de @menção nos comentários)', () => {
  it('texto sem menção devolve um único segmento de texto', () => {
    expect(dividirPorMencoes('sem menções aqui')).toEqual([{ tipo: 'texto', valor: 'sem menções aqui' }]);
  });

  it('texto vazio devolve []', () => {
    expect(dividirPorMencoes('')).toEqual([]);
  });

  it('menção simples no meio do texto vira 3 segmentos (texto/menção/texto)', () => {
    expect(dividirPorMencoes('Oi @financeiro, tudo bem?')).toEqual([
      { tipo: 'texto', valor: 'Oi ' },
      { tipo: 'mencao', valor: '@financeiro' },
      { tipo: 'texto', valor: ', tudo bem?' },
    ]);
  });

  it('menção no início da string não gera segmento de texto vazio antes dela', () => {
    expect(dividirPorMencoes('@financeiro confirma isso')).toEqual([
      { tipo: 'mencao', valor: '@financeiro' },
      { tipo: 'texto', valor: ' confirma isso' },
    ]);
  });

  it('menção no fim da string não gera segmento de texto vazio depois dela', () => {
    expect(dividirPorMencoes('confirma @financeiro')).toEqual([
      { tipo: 'texto', valor: 'confirma ' },
      { tipo: 'mencao', valor: '@financeiro' },
    ]);
  });

  it('múltiplas menções são todas destacadas, na ordem em que aparecem', () => {
    expect(dividirPorMencoes('@Financeiro e @comercial, confirmem')).toEqual([
      { tipo: 'mencao', valor: '@Financeiro' },
      { tipo: 'texto', valor: ' e ' },
      { tipo: 'mencao', valor: '@comercial' },
      { tipo: 'texto', valor: ', confirmem' },
    ]);
  });

  it('pontuação de fim de frase colada ao handle fica FORA do segmento de menção', () => {
    expect(dividirPorMencoes('confirma @financeiro.')).toEqual([
      { tipo: 'texto', valor: 'confirma ' },
      { tipo: 'mencao', valor: '@financeiro' },
      { tipo: 'texto', valor: '.' },
    ]);
  });

  it('e-mail completo em prosa (precedido de char de palavra) não é destacado como menção', () => {
    expect(dividirPorMencoes('mande pro email financeiro@bazarmattos.com.br por favor')).toEqual([
      { tipo: 'texto', valor: 'mande pro email financeiro@bazarmattos.com.br por favor' },
    ]);
  });

  it('reconstituir os valores dos segmentos reproduz o texto original', () => {
    const original = 'Oi @Financeiro, cc @comercial: confirmem. Sem handle solto aqui.';
    const reconstituido = dividirPorMencoes(original)
      .map((s) => s.valor)
      .join('');
    expect(reconstituido).toBe(original);
  });
});
