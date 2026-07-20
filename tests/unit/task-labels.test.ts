import { describe, expect, it } from 'vitest';

import { normalizarLabels, sugerirLabels } from '@/modules/tasks/labels';

describe('normalizarLabels', () => {
  it('raw não-array devolve []', () => {
    expect(normalizarLabels(null)).toEqual([]);
    expect(normalizarLabels(undefined)).toEqual([]);
    expect(normalizarLabels('promo')).toEqual([]);
    expect(normalizarLabels(42)).toEqual([]);
    expect(normalizarLabels({ a: 1 })).toEqual([]);
  });

  it('trima espaços e descarta vazios', () => {
    expect(normalizarLabels(['  promo  ', '', '   ', 'ok'])).toEqual(['promo', 'ok']);
  });

  it('dedup case-insensitive mantendo a primeira ocorrência (com sua grafia original)', () => {
    expect(normalizarLabels(['Promo', 'promo', 'PROMO', 'outra'])).toEqual(['Promo', 'outra']);
  });

  it('capa cada label em 20 caracteres', () => {
    const longa = 'a'.repeat(30);
    expect(normalizarLabels([longa])).toEqual([longa.slice(0, 20)]);
  });

  it('dedup considera a versão já capada em 20 chars (duas labels que só diferem após o corte viram uma só)', () => {
    const base = 'x'.repeat(20);
    expect(normalizarLabels([`${base}A`, `${base}B`])).toEqual([base]);
  });

  it('limita a no máximo 10 labels', () => {
    const entradas = Array.from({ length: 15 }, (_, i) => `l${i}`);
    const resultado = normalizarLabels(entradas);
    expect(resultado).toHaveLength(10);
    expect(resultado).toEqual(entradas.slice(0, 10));
  });

  it('coage number/boolean para string; ignora null/undefined/objetos/arrays aninhados', () => {
    expect(normalizarLabels([123, true, null, undefined, {}, ['nested'], 'ok'])).toEqual(['123', 'true', 'ok']);
  });

  it('array vazio devolve []', () => {
    expect(normalizarLabels([])).toEqual([]);
  });
});

describe('sugerirLabels', () => {
  it('agrega frequência das labels usadas na org e ordena desc', () => {
    const usadas = [['urgente', 'bug'], ['urgente'], ['ux'], ['bug'], ['urgente']];
    expect(sugerirLabels(usadas)).toEqual(['urgente', 'bug', 'ux']);
  });

  it('dedup case-insensitive na agregação, mantendo a grafia da primeira ocorrência', () => {
    const usadas = [['Bug'], ['bug'], ['BUG']];
    expect(sugerirLabels(usadas)).toEqual(['Bug']);
  });

  it('sem labels usadas devolve []', () => {
    expect(sugerirLabels([])).toEqual([]);
    expect(sugerirLabels([[], []])).toEqual([]);
  });

  it('limita a no máximo 10 sugestões', () => {
    const usadas = Array.from({ length: 12 }, (_, i) => [`l${i}`]);
    expect(sugerirLabels(usadas)).toHaveLength(10);
  });

  it('trima espaços e descarta vazios ao agregar', () => {
    const usadas = [[' promo ', 'promo'], ['']];
    expect(sugerirLabels(usadas)).toEqual(['promo']);
  });
});
