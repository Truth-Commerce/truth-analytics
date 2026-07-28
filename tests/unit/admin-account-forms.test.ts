import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>();
  return {
    ...actual,
    useFormState: () => [{}, '/mock-action'] as const,
  };
});

import { CriarAnalistaForm } from '@/app/admin/usuarios/criar-analista-form';
import { CriarClienteForm } from '@/app/admin/usuarios/criar-cliente-form';

describe('formulários de provisionamento administrativo', () => {
  it('cliente pede somente empresa e e-mail, sem organização ou papel selecionáveis', () => {
    const html = renderToStaticMarkup(createElement(CriarClienteForm));

    expect(html).toContain('Criar cliente');
    expect(html).toContain('name="orgName"');
    expect(html).toContain('name="email"');
    expect(html).not.toContain('name="orgId"');
    expect(html).not.toContain('name="role"');
    expect(html).not.toContain('<select');
  });

  it('analista pede somente e-mail, sem organização ou papel selecionáveis', () => {
    const html = renderToStaticMarkup(createElement(CriarAnalistaForm));

    expect(html).toContain('Criar analista');
    expect(html).toContain('name="email"');
    expect(html).not.toContain('name="orgId"');
    expect(html).not.toContain('name="role"');
    expect(html).not.toContain('<select');
  });
});
