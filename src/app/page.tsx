import type { Metadata } from 'next';
import Link from 'next/link';

import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { LandingStats } from './landing-stats';
import { LandingMock } from './landing-mock';
import { LandingMarquee } from './landing-marquee';

export const metadata: Metadata = {
  title: { absolute: 'Truth Analytics — Inteligência de marketplace por IA' },
  description:
    'Relatórios periódicos gerados por IA a partir do seu Bling: métricas de vendas, benchmark de mercado e recomendações de preço.',
};

const steps = [
  {
    number: '01',
    title: 'Conecte o Bling',
    description:
      'Autorize o Truth Analytics a acessar seus dados de vendas via OAuth Bling. Leva menos de um minuto.',
  },
  {
    number: '02',
    title: 'A IA analisa',
    description:
      'Nossa IA processa seus pedidos, benchmarks de mercado e histórico de preços para gerar relatórios periódicos.',
  },
  {
    number: '03',
    title: 'Receba recomendações',
    description:
      'Receba métricas consolidadas, análise de concorrência e sugestões de preço direto no painel.',
  },
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-bg-base text-white">
      {/* Radial gradient background — CSS only, no images */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(7,221,43,0.07) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(7,221,43,0.04) 0%, transparent 60%)',
        }}
      />

      {/* ── Top Bar ── */}
      <header className="relative z-10 border-b border-line bg-bg-surface/60 backdrop-blur-sm">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/"
            aria-label="Truth Analytics — página inicial"
            className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <Logo withMark size="sm" />
          </Link>

          <div className="flex items-center gap-2">
            <Button as="a" href="/sign-in" variant="secondary" size="sm">
              Entrar
            </Button>
            <Button as="a" href="/sign-up" variant="primary" size="sm">
              Criar conta
            </Button>
          </div>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="relative z-10 mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6 sm:py-28">
        <Badge variant="mono">Análise por IA</Badge>

        <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl md:text-6xl">
          Inteligência de marketplace
          <br />
          <span className="text-brand">para o seu e-commerce.</span>
        </h1>

        <p className="max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
          Relatórios periódicos gerados por IA a partir do seu Bling — métricas de vendas,
          benchmark de mercado e recomendações de preço para você vender mais com margem.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button as="a" href="/sign-up" variant="primary" className="shadow-glow-3">
            Começar gratuitamente
          </Button>
          <Button as="a" href="/sign-in" variant="secondary">
            Já tenho conta
          </Button>
        </div>
      </section>

      {/* ── Números do produto ── */}
      <section className="relative z-10 mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <LandingStats />
      </section>

      {/* ── Mock do dashboard ── */}
      <section className="relative z-10 mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <LandingMock />
      </section>

      {/* ── Canais ── */}
      <section className="relative z-10 mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        <LandingMarquee />
      </section>

      {/* ── Como funciona ── */}
      <section className="relative z-10 mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <div className="mb-10 text-center">
          <h2 className="font-heading text-2xl font-semibold text-white sm:text-3xl">
            Como funciona
          </h2>
          <p className="mt-2 text-sm text-muted">Três passos. Nenhuma planilha.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {steps.map((step) => (
            <Card key={step.number} className="flex flex-col gap-3">
              <span className="font-mono text-xs tracking-widest text-brand">{step.number}</span>
              <h3 className="font-heading text-base font-semibold text-white">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted">{step.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-line py-6 text-center">
        <p className="text-xs text-dim">
          &copy; {new Date().getFullYear()} Truth Commerce. Todos os direitos reservados.
        </p>
        <p className="mt-2 text-xs text-dim">
          <Link href="/termos" className="transition-colors hover:text-muted hover:underline">
            Termos de Uso
          </Link>
          <span className="mx-2">·</span>
          <Link href="/privacidade" className="transition-colors hover:text-muted hover:underline">
            Política de Privacidade
          </Link>
        </p>
      </footer>
    </main>
  );
}
