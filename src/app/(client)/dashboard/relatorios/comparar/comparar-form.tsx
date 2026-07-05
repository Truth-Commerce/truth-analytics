'use client';

type RelatorioOption = { id: string; label: string };

/**
 * Form GET puro — sem estado no client. A submissão recarrega a página
 * server-side com `?a=...&b=...`, que faz a busca escopada por org.
 */
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
    <form
      method="get"
      data-testid="comparar-form"
      className="flex flex-wrap items-end gap-3"
    >
      <label className="flex flex-col gap-1 text-sm text-muted">
        Período A
        <select
          name="a"
          defaultValue={a ?? ''}
          className="rounded-lg border border-line bg-bg-surface px-3 py-2 text-white"
        >
          <option value="" disabled>
            Selecione…
          </option>
          {relatorios.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted">
        Período B
        <select
          name="b"
          defaultValue={b ?? ''}
          className="rounded-lg border border-line bg-bg-surface px-3 py-2 text-white"
        >
          <option value="" disabled>
            Selecione…
          </option>
          {relatorios.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-black hover:brightness-110"
      >
        Comparar
      </button>
    </form>
  );
}
