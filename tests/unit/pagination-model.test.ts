import { describe, expect, it } from 'vitest';

import { paginationRange } from '@/components/ui/pagination-model';

describe('paginationRange', () => {
  it('poucas páginas: lista todas sem gap', () => {
    expect(paginationRange(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('muitas páginas, no meio: gaps dos dois lados', () => {
    expect(paginationRange(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
  });

  it('início: gap só à direita', () => {
    expect(paginationRange(2, 20)).toEqual([1, 2, 3, 'gap', 20]);
  });

  it('fim: gap só à esquerda', () => {
    expect(paginationRange(19, 20)).toEqual([1, 'gap', 18, 19, 20]);
  });

  it('1 página: só ela', () => {
    expect(paginationRange(1, 1)).toEqual([1]);
  });
});
