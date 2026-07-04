import { serverEnv } from '@/lib/env';

/**
 * Dispara o pipeline em background: POST autenticado para /api/pipeline/run.
 * O chamador só aguarda o 202 (aceite) — nunca o pipeline inteiro.
 */
export async function dispatchPipelineRun(reportId: string): Promise<void> {
  if (!serverEnv.PIPELINE_SECRET) {
    throw new Error('pipeline_nao_configurado');
  }
  const res = await fetch(`${serverEnv.APP_URL}/api/pipeline/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pipeline-secret': serverEnv.PIPELINE_SECRET,
    },
    body: JSON.stringify({ reportId }),
  });
  if (res.status !== 202) {
    throw new Error(`pipeline_dispatch_falhou_${res.status}`);
  }
}
