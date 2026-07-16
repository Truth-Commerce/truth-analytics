'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';

import {
  staffAddTrackedProductAction,
  staffRemoveTrackedProductAction,
  type StaffProdutosState,
} from '@/actions/staff.actions';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

const initial: StaffProdutosState = {};

type Produto = { id: string; nome: string; sku: string | null; keywords: string[] };

export function StaffTrackedProducts({ orgId, produtos }: { orgId: string; produtos: Produto[] }) {
  const [addState, add] = useFormState(staffAddTrackedProductAction, initial);
  const [rmState, remove] = useFormState(staffRemoveTrackedProductAction, initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const formsRef = useRef<Map<string, HTMLFormElement>>(new Map());
  const { toast } = useToast();

  useEffect(() => {
    if (addState.error)
      toast({ title: 'Não foi possível adicionar.', description: addState.error, variant: 'error' });
  }, [addState, toast]);

  useEffect(() => {
    if (rmState.error)
      toast({ title: 'Não foi possível remover.', description: rmState.error, variant: 'error' });
  }, [rmState, toast]);

  const pendente = produtos.find((p) => p.id === pendingId);

  return (
    <div>
      <form action={add} className="mb-5 grid gap-3 sm:grid-cols-3" data-testid="staff-add-form">
        <input type="hidden" name="orgId" value={orgId} />
        <Field label="Nome do produto" htmlFor="staff-nome">
          <Input id="staff-nome" name="nome" placeholder="Ex: Tênis Running Pro" />
        </Field>
        <Field label="SKU (opcional)" htmlFor="staff-sku">
          <Input id="staff-sku" name="sku" placeholder="Ex: TRP-001" />
        </Field>
        <Field label="Palavras-chave" htmlFor="staff-keywords">
          <Input id="staff-keywords" name="keywords" placeholder="tênis, corrida, running" />
        </Field>
        <div className="flex items-end sm:col-span-3">
          <Button type="submit" variant="primary" size="sm">
            Adicionar
          </Button>
        </div>
      </form>

      {addState.error ? (
        <p role="alert" className="mb-3 text-sm text-danger-fg">
          {addState.error}
        </p>
      ) : null}
      {rmState.error ? (
        <p role="alert" className="mb-3 text-sm text-danger-fg">
          {rmState.error}
        </p>
      ) : null}

      <ul className="flex flex-col divide-y divide-line">
        {produtos.map((p) => (
          <li
            key={p.id}
            data-testid={`staff-produto-${p.id}`}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <span className="text-white/90">
              {p.nome}
              {p.sku ? <span className="ml-1.5 font-mono text-xs text-muted">({p.sku})</span> : ''}
              {p.keywords.length > 0 ? (
                <span className="ml-2 font-mono text-xs text-dim">{p.keywords.join(', ')}</span>
              ) : null}
            </span>
            <form
              action={remove}
              ref={(el) => {
                if (el) formsRef.current.set(p.id, el);
                else formsRef.current.delete(p.id);
              }}
            >
              <input type="hidden" name="orgId" value={orgId} />
              <input type="hidden" name="id" value={p.id} />
              <Button type="button" variant="danger" size="sm" onClick={() => setPendingId(p.id)}>
                Remover
              </Button>
            </form>
          </li>
        ))}
        {produtos.length === 0 ? (
          <li className="py-3">
            <EmptyState
              title="Nenhum produto monitorado ainda."
              description="Cadastre os produtos e palavras-chave deste cliente — eles alimentam o benchmark do relatório."
            />
          </li>
        ) : null}
      </ul>

      <ConfirmDialog
        open={pendingId !== null}
        title={`Remover ${pendente?.nome ?? 'este produto'}?`}
        description="O produto sai do monitoramento de mercado dos próximos relatórios deste cliente."
        confirmLabel="Remover"
        onConfirm={() => {
          if (pendingId) formsRef.current.get(pendingId)?.requestSubmit();
          setPendingId(null);
        }}
        onCancel={() => setPendingId(null)}
      />
    </div>
  );
}
