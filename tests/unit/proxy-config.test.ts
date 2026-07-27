import { describe, expect, it } from 'vitest';

import { config, proxy } from '@/proxy';

describe('proxy de autenticação', () => {
  it('exporta handler e exclui APIs e arquivos estáticos do matcher', () => {
    expect(typeof proxy).toBe('function');
    expect(config.matcher).toEqual([
      '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ]);
  });
});
