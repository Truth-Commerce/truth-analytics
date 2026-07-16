'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/Alert';
import { Stepper } from '@/components/ui/Stepper';
import { ETAPAS_GERACAO, geracaoView } from '@/modules/reports/stepper-model';

import { useReportStatus } from './use-report-status';

/** Momento "wow": stepper cinematográfico alimentado pelo pipeline em background. */
export function GenerationProgress({ reportId }: { reportId: string }) {
  const payload = useReportStatus(reportId);
  const router = useRouter();
  const view = geracaoView(payload?.status ?? 'queued', payload?.etapa ?? null);

  // Ao terminar, refresca os RSC (histórico/último relatório aparecem sem F5)
  useEffect(() => {
    if (view.done || view.failed) router.refresh();
  }, [view.done, view.failed, router]);

  return (
    <div data-testid="generation-progress" aria-live="polite" className="mt-4">
      <Stepper steps={ETAPAS_GERACAO} activeIndex={view.activeIndex} failed={view.failed} />
      {view.done ? (
        <p className="mt-2 text-sm text-brand">
          Relatório pronto.{' '}
          <Link
            href={`/dashboard/relatorios/${reportId}`}
            className="underline underline-offset-2 hover:text-white"
          >
            Ver relatório →
          </Link>
        </p>
      ) : null}
      {view.failed ? (
        <Alert variant="danger" className="mt-2">
          A geração não foi concluída desta vez. Tente novamente — se persistir, fale com o
          suporte.
        </Alert>
      ) : null}
    </div>
  );
}
