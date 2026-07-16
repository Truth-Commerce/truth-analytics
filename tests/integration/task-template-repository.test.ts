import { like } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { taskTemplates } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const PREFIX = 'ta-test-tpl-';

describe.skipIf(!url)('task-template.repository — lado-escrita (integração)', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const tdb = drizzle(sql);

  afterAll(async () => {
    await tdb.delete(taskTemplates).where(like(taskTemplates.titulo, `${PREFIX}%`));
    await sql.end();
  });

  it('createTemplate com checklist de 2 itens aparece em listTemplates()', async () => {
    const { createTemplate, listTemplates } = await import('@/modules/tasks/task-template.repository');

    const id = await createTemplate({
      titulo: `${PREFIX}Revisar catálogo`,
      tipo: 'catalogo',
      descricao: 'Checklist padrão de revisão de catálogo.',
      checklist: ['Conferir título', 'Conferir imagens'],
    });

    const all = await listTemplates();
    const criado = all.find((t) => t.id === id);
    expect(criado).toBeDefined();
    expect(criado?.checklist).toEqual(['Conferir título', 'Conferir imagens']);
    expect(criado?.ativo).toBe(true);
  });

  it('setTemplateAtivo(false) some de listTemplates(true) mas continua em listTemplates()', async () => {
    const { createTemplate, listTemplates, setTemplateAtivo } = await import(
      '@/modules/tasks/task-template.repository'
    );

    const id = await createTemplate({
      titulo: `${PREFIX}Ajustar preço`,
      tipo: 'preco',
      checklist: ['Conferir margem'],
    });

    let ativos = await listTemplates(true);
    expect(ativos.some((t) => t.id === id)).toBe(true);

    await setTemplateAtivo(id, false);

    ativos = await listTemplates(true);
    expect(ativos.some((t) => t.id === id)).toBe(false);

    const todos = await listTemplates(false);
    expect(todos.some((t) => t.id === id)).toBe(true);
  });

  it('prioridade e prazoDias persistem e voltam no shape do TaskTemplate', async () => {
    const { createTemplate, getTemplateById, updateTemplate } = await import(
      '@/modules/tasks/task-template.repository'
    );

    const id = await createTemplate({
      titulo: `${PREFIX}Playbook com prazo`,
      tipo: 'preco',
      checklist: [],
      prioridade: 'alta',
      prazoDias: 5,
    });

    const tpl = await getTemplateById(id);
    expect(tpl?.prioridade).toBe('alta');
    expect(tpl?.prazoDias).toBe(5);

    // patch dos campos novos (inclusive limpar o prazo)
    await updateTemplate(id, { prioridade: 'baixa', prazoDias: null });
    const editado = await getTemplateById(id);
    expect(editado?.prioridade).toBe('baixa');
    expect(editado?.prazoDias).toBeNull();
  });

  it('sem prioridade/prazoDias no input → defaults media e null', async () => {
    const { createTemplate, getTemplateById } = await import('@/modules/tasks/task-template.repository');

    const id = await createTemplate({
      titulo: `${PREFIX}Playbook default`,
      tipo: 'outro',
      checklist: [],
    });

    const tpl = await getTemplateById(id);
    expect(tpl?.prioridade).toBe('media');
    expect(tpl?.prazoDias).toBeNull();
  });

  it('updateTemplate altera o título (e demais campos) do template', async () => {
    const { createTemplate, getTemplateById, updateTemplate } = await import(
      '@/modules/tasks/task-template.repository'
    );

    const id = await createTemplate({
      titulo: `${PREFIX}Original`,
      tipo: 'anuncio',
      checklist: ['Item único'],
    });

    await updateTemplate(id, { titulo: `${PREFIX}Editado`, descricao: 'nova descrição' });

    const editado = await getTemplateById(id);
    expect(editado?.titulo).toBe(`${PREFIX}Editado`);
    expect(editado?.descricao).toBe('nova descrição');
    // campos não passados no patch permanecem intactos
    expect(editado?.tipo).toBe('anuncio');
    expect(editado?.checklist).toEqual(['Item único']);
  });
});
