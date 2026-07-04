import { describe, expect, it } from 'vitest';

import { podeTransicionar, proximoStatusAoConcluir } from '@/modules/tasks/task-transitions';

describe('transições de task', () => {
  it('concluir: task do cliente vai direto a concluida; de analista/ia vai a em_revisao', () => {
    expect(proximoStatusAoConcluir('cliente')).toBe('concluida');
    expect(proximoStatusAoConcluir('analista')).toBe('em_revisao');
    expect(proximoStatusAoConcluir('ia')).toBe('em_revisao');
  });

  it('cliente move livremente entre backlog/todo/em_andamento', () => {
    expect(podeTransicionar({ ator: 'cliente', criadoPor: 'ia', de: 'backlog', para: 'todo' })).toBe(true);
    expect(podeTransicionar({ ator: 'cliente', criadoPor: 'ia', de: 'em_andamento', para: 'todo' })).toBe(true);
  });

  it('cliente NÃO conclui direto task criada por ia/analista (vai a em_revisao)', () => {
    expect(podeTransicionar({ ator: 'cliente', criadoPor: 'ia', de: 'em_andamento', para: 'concluida' })).toBe(false);
    expect(podeTransicionar({ ator: 'cliente', criadoPor: 'ia', de: 'em_andamento', para: 'em_revisao' })).toBe(true);
    expect(podeTransicionar({ ator: 'cliente', criadoPor: 'cliente', de: 'em_andamento', para: 'concluida' })).toBe(true);
  });

  it('cliente não mexe em em_revisao/concluida', () => {
    expect(podeTransicionar({ ator: 'cliente', criadoPor: 'ia', de: 'em_revisao', para: 'em_andamento' })).toBe(false);
    expect(podeTransicionar({ ator: 'cliente', criadoPor: 'cliente', de: 'concluida', para: 'todo' })).toBe(false);
  });

  it('analista e admin fazem qualquer transição (aprovar, devolver, reabrir)', () => {
    expect(podeTransicionar({ ator: 'analista', criadoPor: 'ia', de: 'em_revisao', para: 'concluida' })).toBe(true);
    expect(podeTransicionar({ ator: 'analista', criadoPor: 'ia', de: 'em_revisao', para: 'em_andamento' })).toBe(true);
    expect(podeTransicionar({ ator: 'admin', criadoPor: 'cliente', de: 'concluida', para: 'todo' })).toBe(true);
  });

  it('de === para é sempre inválido', () => {
    expect(podeTransicionar({ ator: 'admin', criadoPor: 'ia', de: 'todo', para: 'todo' })).toBe(false);
  });
});
