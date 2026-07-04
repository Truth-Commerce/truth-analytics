import { describe, expect, it } from 'vitest';

import { parseChecklist, toggleChecklistLine } from '@/modules/tasks/checklist-line';

describe('parseChecklist', () => {
  it('extrai itens de checklist de uma descrição com texto livre + linhas marcadas', () => {
    const descricao = 'desc\n- [ ] a\n- [x] b';
    expect(parseChecklist(descricao)).toEqual([
      { texto: 'a', feito: false },
      { texto: 'b', feito: true },
    ]);
  });

  it('descrição sem checklist retorna lista vazia', () => {
    expect(parseChecklist('apenas texto livre, sem itens')).toEqual([]);
    expect(parseChecklist('')).toEqual([]);
  });

  it('ignora linhas em branco e mantém a ordem original', () => {
    const descricao = '- [x] primeiro\n\n- [ ] segundo\n- [x] terceiro';
    expect(parseChecklist(descricao)).toEqual([
      { texto: 'primeiro', feito: true },
      { texto: 'segundo', feito: false },
      { texto: 'terceiro', feito: true },
    ]);
  });
});

describe('toggleChecklistLine — roundtrip', () => {
  it('alterna marcado -> desmarcado -> marcado preservando o texto', () => {
    const original = 'contexto\n- [ ] item único';
    const marcado = toggleChecklistLine(original, 1);
    expect(marcado).toBe('contexto\n- [x] item único');
    expect(parseChecklist(marcado)).toEqual([{ texto: 'item único', feito: true }]);

    const desmarcado = toggleChecklistLine(marcado, 1);
    expect(desmarcado).toBe(original);
    expect(parseChecklist(desmarcado)).toEqual([{ texto: 'item único', feito: false }]);
  });
});
