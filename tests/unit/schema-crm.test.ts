import { describe, expect, it } from 'vitest';
import { getTableColumns } from 'drizzle-orm';

import { notifications, organizations, taskActivities, taskComments, taskTemplates, tasks } from '@/db/schema';

describe('schema F2 (CRM)', () => {
  it('tasks tem as colunas do contrato', () => {
    const cols = Object.keys(getTableColumns(tasks));
    for (const c of [
      'id', 'org_id', 'titulo', 'descricao', 'tipo', 'prioridade', 'status',
      'prazo', 'criado_por', 'report_id', 'assignee_user_id', 'ordem',
      'created_at', 'updated_at',
    ]) expect(cols).toContain(c);
  });
  it('task_comments referencia task e user', () => {
    const cols = Object.keys(getTableColumns(taskComments));
    expect(cols).toEqual(expect.arrayContaining(['id', 'task_id', 'user_id', 'corpo', 'created_at']));
  });
  it('task_activities tem evento/de/para', () => {
    const cols = Object.keys(getTableColumns(taskActivities));
    expect(cols).toEqual(expect.arrayContaining(['id', 'task_id', 'user_id', 'evento', 'de', 'para', 'created_at']));
  });
  it('task_templates tem checklist jsonb + ativo', () => {
    const cols = Object.keys(getTableColumns(taskTemplates));
    expect(cols).toEqual(expect.arrayContaining(['id', 'titulo', 'tipo', 'descricao', 'checklist', 'ativo', 'created_at', 'updated_at']));
  });
  it('notifications tem user_id/tipo/titulo/corpo/href/lida', () => {
    const cols = Object.keys(getTableColumns(notifications));
    expect(cols).toEqual(expect.arrayContaining(['id', 'user_id', 'tipo', 'titulo', 'corpo', 'href', 'lida', 'created_at']));
  });
  it('organizations tem analista_id', () => {
    expect(Object.keys(getTableColumns(organizations))).toContain('analista_id');
  });
});
