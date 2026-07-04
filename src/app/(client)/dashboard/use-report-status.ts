'use client';

import { useEffect, useState } from 'react';

import type { ReportStatus } from '@/modules/reports/report.types';
import type { EtapaPipeline } from '@/modules/reports/stepper-model';

export type ReportStatusPayload = {
  status: ReportStatus;
  etapa: EtapaPipeline | null;
};

/**
 * Polling de 3 s do contrato F0 GET /api/reports/[id]/status.
 * Para sozinho quando o status é terminal (done/failed).
 */
export function useReportStatus(
  reportId: string | null,
  intervalMs = 3000,
): ReportStatusPayload | null {
  const [payload, setPayload] = useState<ReportStatusPayload | null>(null);

  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      try {
        const res = await fetch(`/api/reports/${reportId}/status`, { cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json()) as ReportStatusPayload;
          if (cancelled) return;
          setPayload(data);
          if (data.status === 'done' || data.status === 'failed') return;
        }
      } catch {
        // erro de rede transitório: tenta de novo no próximo tick
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [reportId, intervalMs]);

  return payload;
}
