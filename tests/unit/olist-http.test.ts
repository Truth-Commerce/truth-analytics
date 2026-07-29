import { describe, expect, it } from 'vitest';
import { WORST_CASE_OLIST_REQUEST_MS } from '@/modules/providers/olist/http';

describe('Olist HTTP deadline', () => {
  it('expõe um orçamento absoluto de sessenta segundos', () => {
    expect(WORST_CASE_OLIST_REQUEST_MS).toBe(60_000);
  });
});
