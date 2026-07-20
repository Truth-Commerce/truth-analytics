import { encerrarImpersonationAction } from '@/actions/admin.actions';

/**
 * Faixa exibida SÓ quando um admin_truth está "vendo como" um cliente (Task
 * 12 H4) — o cliente real nunca vê isto (o layout só renderiza este
 * componente quando getImpersonationBanner devolve não-nulo, o que exige
 * papel real admin_truth + cookie válido).
 */
export function ImpersonationBanner({ orgName }: { orgName: string }) {
  return (
    <div
      data-testid="impersonation-banner"
      className="flex flex-wrap items-center justify-center gap-3 bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-[#241a00]"
    >
      <span>
        Você está vendo como <span className="font-bold">{orgName}</span> — modo visualização
      </span>
      <form action={encerrarImpersonationAction}>
        <button
          type="submit"
          className="rounded-full border border-black/20 px-3 py-1 text-xs font-semibold outline-none transition-colors hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-black/40"
        >
          Sair
        </button>
      </form>
    </div>
  );
}
