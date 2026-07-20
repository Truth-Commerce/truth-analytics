import { describe, expect, it } from 'vitest';

import { extrairMencoes, handleFromEmail } from '@/modules/tasks/mencoes';

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
