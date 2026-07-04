import { describe, expect, it } from 'vitest';

import { inferTipoTask, itemToTaskInput, tituloFromItem } from '@/modules/tasks/report-to-task';

describe('heurística relatório→task', () => {
  it('classifica por palavra-chave (com acentos)', () => {
    expect(inferTipoTask('Reajustar o preço do SKU-001 para proteger a margem')).toBe('preco');
    expect(inferTipoTask('Custo de frete elevado no canal ML')).toBe('logistica');
    expect(inferTipoTask('Melhorar título e fotos do anúncio principal')).toBe('anuncio');
    expect(inferTipoTask('Cadastrar EAN nos produtos sem código')).toBe('catalogo');
    expect(inferTipoTask('Responder reclamações para recuperar reputação')).toBe('conta');
    expect(inferTipoTask('Fazer live de lançamento no Instagram')).toBe('outro');
  });

  it('preço vence quando há ambiguidade (ordem de precedência)', () => {
    expect(inferTipoTask('Baixar o preço do anúncio com frete grátis')).toBe('preco');
  });

  it('itemToTaskInput monta task da IA com prioridade por fonte', () => {
    const t = itemToTaskInput({ fonte: 'gargalos', texto: 'Custo de frete elevado', reportId: 'r1' });
    expect(t).toMatchObject({ titulo: 'Custo de frete elevado', tipo: 'logistica', prioridade: 'alta', criadoPor: 'ia', reportId: 'r1' });
    expect(itemToTaskInput({ fonte: 'ideiasVenda', texto: 'Criar kit promocional', reportId: 'r1' }).prioridade).toBe('baixa');
  });

  it('tituloFromItem trunca em 140 chars', () => {
    expect(tituloFromItem('x'.repeat(200))).toHaveLength(140);
  });
});
