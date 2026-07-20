import { describe, expect, it } from 'vitest';

import { indiceAlvoPorPonteiro, itemSobPonteiro, passosReordenar } from '@/modules/tasks/dnd';

describe('itemSobPonteiro', () => {
  const colunas = [
    { valor: 'backlog', rect: { top: 0, left: 0, right: 100, bottom: 500 } },
    { valor: 'todo', rect: { top: 0, left: 100, right: 200, bottom: 500 } },
    { valor: 'em_andamento', rect: { top: 0, left: 200, right: 300, bottom: 500 } },
  ];

  it('acha a coluna cujo retângulo contém o ponto', () => {
    expect(itemSobPonteiro(colunas, { x: 50, y: 10 })).toBe('backlog');
    expect(itemSobPonteiro(colunas, { x: 150, y: 10 })).toBe('todo');
    expect(itemSobPonteiro(colunas, { x: 250, y: 10 })).toBe('em_andamento');
  });

  it('bordas são inclusivas', () => {
    expect(itemSobPonteiro(colunas, { x: 100, y: 0 })).toBe('backlog'); // primeiro match na ordem do array
    expect(itemSobPonteiro(colunas, { x: 0, y: 0 })).toBe('backlog');
    expect(itemSobPonteiro(colunas, { x: 300, y: 500 })).toBe('em_andamento');
  });

  it('null quando o ponto está fora de todas as colunas', () => {
    expect(itemSobPonteiro(colunas, { x: -10, y: 10 })).toBeNull();
    expect(itemSobPonteiro(colunas, { x: 50, y: 600 })).toBeNull();
    expect(itemSobPonteiro(colunas, { x: 1000, y: 10 })).toBeNull();
  });

  it('lista vazia devolve null', () => {
    expect(itemSobPonteiro([], { x: 0, y: 0 })).toBeNull();
  });
});

describe('indiceAlvoPorPonteiro', () => {
  it('lista de midpoints vazia (coluna vazia): índice 0', () => {
    expect(indiceAlvoPorPonteiro([], 999)).toBe(0);
  });

  it('ponteiro acima do primeiro midpoint: índice 0', () => {
    expect(indiceAlvoPorPonteiro([100, 200, 300], 10)).toBe(0);
  });

  it('ponteiro entre dois midpoints: índice do meio', () => {
    expect(indiceAlvoPorPonteiro([100, 200, 300], 150)).toBe(1);
  });

  it('ponteiro abaixo do último midpoint: índice = tamanho da lista', () => {
    expect(indiceAlvoPorPonteiro([100, 200, 300], 999)).toBe(3);
  });

  it('ponteiro exatamente sobre um midpoint conta como "depois" dele', () => {
    expect(indiceAlvoPorPonteiro([100, 200], 100)).toBe(1);
  });
});

describe('passosReordenar', () => {
  it('mesmo índice: sem mudança (null)', () => {
    expect(passosReordenar(2, 2)).toBeNull();
  });

  it('alvo antes da posição atual: direção up, passos = diferença', () => {
    expect(passosReordenar(2, 0)).toEqual({ direcao: 'up', passos: 2 });
    expect(passosReordenar(3, 2)).toEqual({ direcao: 'up', passos: 1 });
  });

  it('alvo depois da posição atual: direção down, passos = diferença', () => {
    expect(passosReordenar(0, 3)).toEqual({ direcao: 'down', passos: 3 });
    expect(passosReordenar(1, 2)).toEqual({ direcao: 'down', passos: 1 });
  });
});
