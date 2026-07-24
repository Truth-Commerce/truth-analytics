import { LANDING_CANAIS } from './landing-data';

function Faixa({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <ul
      aria-hidden={ariaHidden || undefined}
      className="flex flex-none items-center gap-10 pr-10"
    >
      {LANDING_CANAIS.map((c) => (
        <li
          key={c}
          className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted"
        >
          {c}
        </li>
      ))}
    </ul>
  );
}

/** Marquee dos canais (via Bling). Pausa no hover; reduced-motion = estático. */
export function LandingMarquee() {
  return (
    <section aria-label="Canais de venda compatíveis via Bling" className="space-y-3">
      <p className="text-center text-xs text-dim">
        Vendas de todos os canais do seu Bling, num só relatório
      </p>
      <div className="group relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
        <div className="flex w-max motion-safe:animate-marquee motion-safe:group-hover:[animation-play-state:paused] motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center">
          <Faixa />
          <div className="flex motion-reduce:hidden">
            <Faixa ariaHidden />
          </div>
        </div>
      </div>
    </section>
  );
}
