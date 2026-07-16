'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';

import {
  createTemplateAction,
  toggleTemplateAtivoAction,
  updateTemplateAction,
  type TemplateActionState,
} from '@/actions/task-templates.actions';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import type { TaskTemplate } from '@/modules/tasks/task-template.repository';
import {
  PRIORIDADE_TASK_LABEL,
  TASK_PRIORIDADES,
  TASK_TIPOS,
  TIPO_TASK_LABEL,
} from '@/modules/tasks/task.types';

const initial: TemplateActionState = {};

function ToggleAtivo({ id, ativo }: { id: string; ativo: boolean }) {
  return (
    <form action={toggleTemplateAtivoAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="ativo" value={String(!ativo)} />
      <Button type="submit" variant={ativo ? 'secondary' : 'primary'} size="sm">
        {ativo ? 'Desativar' : 'Ativar'}
      </Button>
    </form>
  );
}

export function PlaybooksManager({ templates }: { templates: TaskTemplate[] }) {
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [createState, createAction] = useFormState(createTemplateAction, initial);
  const [updateState, runUpdateAction] = useFormState(updateTemplateAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  const isEditing = editing !== null;
  const action = isEditing ? runUpdateAction : createAction;
  const state = isEditing ? updateState : createState;

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setEditing(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-4 font-heading text-lg font-semibold text-white">
          {isEditing ? `Editar playbook — ${editing.titulo}` : 'Novo playbook'}
        </h2>
        <form
          ref={formRef}
          action={action}
          data-testid="novo-playbook-form"
          key={editing?.id ?? 'novo'}
          className="grid gap-4 sm:grid-cols-2"
        >
          {isEditing ? <input type="hidden" name="id" value={editing.id} /> : null}

          <Field label="Título" htmlFor="titulo">
            <Input
              id="titulo"
              name="titulo"
              required
              minLength={3}
              maxLength={200}
              defaultValue={editing?.titulo ?? ''}
            />
          </Field>

          <Field label="Tipo" htmlFor="tipo">
            <Select id="tipo" name="tipo" defaultValue={editing?.tipo ?? TASK_TIPOS[0]} required>
              {TASK_TIPOS.map((t) => (
                <option key={t} value={t}>
                  {TIPO_TASK_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Prioridade" htmlFor="prioridade">
            <Select id="prioridade" name="prioridade" defaultValue={editing?.prioridade ?? 'media'}>
              {TASK_PRIORIDADES.map((p) => (
                <option key={p} value={p}>
                  {PRIORIDADE_TASK_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Prazo (dias após criação)" htmlFor="prazoDias">
            <Input
              id="prazoDias"
              name="prazoDias"
              type="number"
              min={1}
              max={365}
              defaultValue={editing?.prazoDias ?? ''}
            />
          </Field>

          <Field label="Descrição" htmlFor="descricao" className="sm:col-span-2">
            <textarea
              id="descricao"
              name="descricao"
              rows={3}
              defaultValue={editing?.descricao ?? ''}
              className="w-full rounded-lg border border-line bg-bg-elevated px-3 py-2 text-white outline-none transition-colors focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/50"
            />
          </Field>

          <Field label="Checklist (1 item por linha)" htmlFor="checklist" className="sm:col-span-2">
            <textarea
              id="checklist"
              name="checklist"
              rows={4}
              defaultValue={editing?.checklist.join('\n') ?? ''}
              className="w-full rounded-lg border border-line bg-bg-elevated px-3 py-2 text-white outline-none transition-colors focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/50"
            />
          </Field>

          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit" variant="primary" size="sm">
              {isEditing ? 'Salvar alterações' : 'Criar playbook'}
            </Button>
            {isEditing ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            ) : null}
            {state.error ? <span className="text-sm text-red-400">{state.error}</span> : null}
          </div>
        </form>
      </Card>

      <Card className="!p-0">
        <Table data-testid="playbooks-table">
          <THead>
            <TR>
              <TH>Título</TH>
              <TH>Tipo</TH>
              <TH>Itens</TH>
              <TH>Status</TH>
              <TH>
                <span className="sr-only">Ações</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {templates.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-muted" colSpan={5}>
                  Nenhum playbook ainda.
                </td>
              </tr>
            ) : (
              templates.map((t) => (
                <TR key={t.id} data-testid={`playbook-${t.id}`}>
                  <TD>{t.titulo}</TD>
                  <TD className="text-muted">{TIPO_TASK_LABEL[t.tipo]}</TD>
                  <TD className="font-mono">{t.checklist.length}</TD>
                  <TD>
                    <Badge variant={t.ativo ? 'success' : 'neutral'}>{t.ativo ? 'Ativo' : 'Inativo'}</Badge>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(t)}>
                        Editar
                      </Button>
                      <ToggleAtivo id={t.id} ativo={t.ativo} />
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
