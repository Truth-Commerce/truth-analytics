import { describe, expect, it } from 'vitest';

import { datasComerciaisDoAno, proximasDatas } from '@/lib/calendario-comercial';

function achar(ano: number, nome: string) {
  return datasComerciaisDoAno(ano).find((d) => d.nome === nome);
}

describe('datasComerciaisDoAno — regras móveis (valores verificados)', () => {
  it('Dia das Mães 2026 = 2º domingo de maio = 10/05', () => {
    expect(achar(2026, 'Dia das Mães')?.data.toISOString().slice(0, 10)).toBe('2026-05-10');
  });

  it('Dia dos Pais 2026 = 2º domingo de agosto = 09/08', () => {
    expect(achar(2026, 'Dia dos Pais')?.data.toISOString().slice(0, 10)).toBe('2026-08-09');
  });

  it('Black Friday 2026 = última sexta de novembro = 27/11', () => {
    expect(achar(2026, 'Black Friday')?.data.toISOString().slice(0, 10)).toBe('2026-11-27');
  });

  it('Páscoa 2026 = 05/04 (computus) e Carnaval = 17/02', () => {
    expect(achar(2026, 'Páscoa')?.data.toISOString().slice(0, 10)).toBe('2026-04-05');
    expect(achar(2026, 'Carnaval')?.data.toISOString().slice(0, 10)).toBe('2026-02-17');
  });

  it('tem ~15 datas, todas com dica não-vazia', () => {
    const datas = datasComerciaisDoAno(2026);
    expect(datas.length).toBeGreaterThanOrEqual(14);
    for (const d of datas) expect(d.dica.length).toBeGreaterThan(0);
  });
});

describe('proximasDatas', () => {
  it('janela de 60 dias a partir de 01/10/2026 → Crianças, Black Friday e Cyber Monday', () => {
    const r = proximasDatas(new Date('2026-10-01T00:00:00Z'), 60);
    expect(r.map((d) => d.nome)).toEqual(['Dia das Crianças', 'Black Friday', 'Cyber Monday']);
  });

  it('cruza a virada do ano (dez → jan/fev do ano seguinte)', () => {
    const r = proximasDatas(new Date('2026-12-20T00:00:00Z'), 60);
    expect(r.map((d) => d.nome)).toContain('Natal');
    expect(r.map((d) => d.nome)).toContain('Ano Novo');
    expect(r.map((d) => d.nome)).toContain('Volta às aulas');
  });

  it('ordenado asc e sem datas fora da janela', () => {
    const r = proximasDatas(new Date('2026-10-01T00:00:00Z'), 60);
    for (let i = 1; i < r.length; i++) expect(r[i].data.getTime()).toBeGreaterThanOrEqual(r[i - 1].data.getTime());
  });
});
