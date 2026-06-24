'use client';

import { useFormState } from 'react-dom';

import {
  addTrackedProductAction,
  removeTrackedProductAction,
  type ConnState,
} from '@/actions/connections.actions';

const initial: ConnState = {};

type Produto = { id: string; nome: string; sku: string | null; ativo: boolean };

export function TrackedProducts({ produtos }: { produtos: Produto[] }) {
  const [addState, add] = useFormState(addTrackedProductAction, initial);
  const [rmState, remove] = useFormState(removeTrackedProductAction, initial);

  return (
    <div>
      <form action={add} className="mb-4 flex flex-wrap gap-2" data-testid="add-form">
        <input name="nome" placeholder="Nome do produto" className="border p-1" />
        <input name="sku" placeholder="SKU (opcional)" className="border p-1" />
        <input name="keywords" placeholder="palavras-chave, separadas, por vírgula" className="border p-1" />
        <button type="submit" className="bg-black px-2 text-white">Adicionar</button>
      </form>
      {addState.error ? <p className="text-sm text-red-600">{addState.error}</p> : null}
      {rmState.error ? <p className="text-sm text-red-600">{rmState.error}</p> : null}

      <ul className="flex flex-col gap-1">
        {produtos.map((p) => (
          <li key={p.id} data-testid={`produto-${p.id}`} className="flex items-center gap-2">
            <span>{p.nome}{p.sku ? ` (${p.sku})` : ''}</span>
            <form action={remove}>
              <input type="hidden" name="id" value={p.id} />
              <button type="submit" className="border px-2 text-sm">Remover</button>
            </form>
          </li>
        ))}
        {produtos.length === 0 ? <li className="text-gray-500">Nenhum produto ainda.</li> : null}
      </ul>
    </div>
  );
}
