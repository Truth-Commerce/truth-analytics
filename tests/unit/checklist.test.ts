import { describe, expect, it } from 'vitest';

import { parseChecklist, toggleChecklistLine } from '@/modules/tasks/checklist-line';

describe('parseChecklist', () => {
  it('extrai itens de checklist de uma descrição com texto livre + linhas marcadas', () => {
    const descricao = 'desc\n- [ ] a\n- [x] b';
    expect(parseChecklist(descricao)).toEqual([
      { texto: 'a', feito: false, linha: 1 },
      { texto: 'b', feito: true, linha: 2 },
    ]);
  });

  it('descrição sem checklist retorna lista vazia', () => {
    expect(parseChecklist('apenas texto livre, sem itens')).toEqual([]);
    expect(parseChecklist('')).toEqual([]);
  });

  it('ignora linhas em branco e mantém a ordem original', () => {
    const descricao = '- [x] primeiro\n\n- [ ] segundo\n- [x] terceiro';
    expect(parseChecklist(descricao)).toEqual([
      { texto: 'primeiro', feito: true, linha: 0 },
      { texto: 'segundo', feito: false, linha: 2 },
      { texto: 'terceiro', feito: true, linha: 3 },
    ]);
  });

  it('devolve o índice de LINHA CRUA (não a posição no array filtrado) quando há texto livre antes do checklist', () => {
    // "Base" (linha 0) e a linha em branco (linha 1) empurram os itens de
    // checklist para as linhas 2 e 3 — o array filtrado começaria em posição
    // 0/1, mas `linha` deve refletir a posição real em descricao.split('\n'),
    // que é o índice que toggleChecklistLine espera receber de volta.
    const descricao = 'Base\n\n- [ ] a\n- [x] b';
    const itens = parseChecklist(descricao);
    expect(itens).toEqual([
      { texto: 'a', feito: false, linha: 2 },
      { texto: 'b', feito: true, linha: 3 },
    ]);

    // Prova de alinhamento: alternar usando `linha` (não a posição no array
    // filtrado, que seria 0/1) deve mexer na linha certa via toggleChecklistLine.
    const alternado = toggleChecklistLine(descricao, itens[0]!.linha);
    expect(alternado).toBe('Base\n\n- [x] a\n- [x] b');

    // Usar a posição do array filtrado (0) em vez de `linha` (2) mexeria na
    // linha errada — aqui a linha 0 é "Base", que não é um item de checklist,
    // então o toggle vira no-op e prova a divergência entre os dois índices.
    const comIndiceErrado = toggleChecklistLine(descricao, 0);
    expect(comIndiceErrado).toBe(descricao);
  });
});

describe('toggleChecklistLine — roundtrip', () => {
  it('alterna marcado -> desmarcado -> marcado preservando o texto', () => {
    const original = 'contexto\n- [ ] item único';
    const marcado = toggleChecklistLine(original, 1);
    expect(marcado).toBe('contexto\n- [x] item único');
    expect(parseChecklist(marcado)).toEqual([{ texto: 'item único', feito: true, linha: 1 }]);

    const desmarcado = toggleChecklistLine(marcado, 1);
    expect(desmarcado).toBe(original);
    expect(parseChecklist(desmarcado)).toEqual([{ texto: 'item único', feito: false, linha: 1 }]);
  });
});
