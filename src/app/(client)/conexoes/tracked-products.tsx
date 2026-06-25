'use client';

import { useFormState } from 'react-dom';

import {
  addTrackedProductAction,
  removeTrackedProductAction,
  type ConnState,
} from '@/actions/connections.actions';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';

const initial: ConnState = {};

type Produto = { id: string; nome: string; sku: string | null; ativo: boolean };

export function TrackedProducts({ produtos }: { produtos: Produto[] }) {
  const [addState, add] = useFormState(addTrackedProductAction, initial);
  const [rmState, remove] = useFormState(removeTrackedProductAction, initial);

  return (
    <div>
      <form action={add} className="mb-5 grid gap-3 sm:grid-cols-3" data-testid="add-form">
        <Field label="Nome do produto" htmlFor="nome">
          <Input id="nome" name="nome" placeholder="Ex: Tênis Running Pro" />
        </Field>
        <Field label="SKU (opcional)" htmlFor="sku">
          <Input id="sku" name="sku" placeholder="Ex: TRP-001" />
        </Field>
        <Field label="Palavras-chave" htmlFor="keywords">
          <Input id="keywords" name="keywords" placeholder="tênis, corrida, running" />
        </Field>
        <div className="flex items-end sm:col-span-3">
          <Button type="submit" variant="primary" size="sm">
            Adicionar
          </Button>
        </div>
      </form>

      {addState.error ? (
        <p className="mb-3 text-sm text-red-400">{addState.error}</p>
      ) : null}
      {rmState.error ? (
        <p className="mb-3 text-sm text-red-400">{rmState.error}</p>
      ) : null}

      <ul className="flex flex-col divide-y divide-line">
        {produtos.map((p) => (
          <li key={p.id} data-testid={`produto-${p.id}`} className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-white/90">
              {p.nome}
              {p.sku ? <span className="ml-1.5 font-mono text-xs text-muted">({p.sku})</span> : ''}
            </span>
            <form action={remove}>
              <input type="hidden" name="id" value={p.id} />
              <Button type="submit" variant="danger" size="sm">
                Remover
              </Button>
            </form>
          </li>
        ))}
        {produtos.length === 0 ? (
          <li className="py-3 text-sm text-muted">Nenhum produto ainda.</li>
        ) : null}
      </ul>
    </div>
  );
}
