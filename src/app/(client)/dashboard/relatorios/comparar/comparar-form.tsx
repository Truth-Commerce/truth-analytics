'use client';

import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';

type RelatorioOption = { id: string; label: string };

/** Form GET puro — a submissão recarrega a página com ?a=&b= (busca escopada por org no server). */
export function CompararForm({
  relatorios,
  a,
  b,
}: {
  relatorios: RelatorioOption[];
  a?: string;
  b?: string;
}) {
  return (
    <form method="get" data-testid="comparar-form" className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm text-muted">
        Período A
        <Select name="a" defaultValue={a ?? ''} className="min-w-[220px]">
          <option value="" disabled>
            Selecione…
          </option>
          {relatorios.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted">
        Período B <span className="text-dim">(vazio = anterior)</span>
        <Select name="b" defaultValue={b ?? ''} className="min-w-[220px]">
          <option value="">Automático (anterior)</option>
          {relatorios.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>
      </label>
      <Button type="submit">Comparar</Button>
    </form>
  );
}
