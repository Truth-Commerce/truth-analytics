import { NextResponse } from 'next/server';

import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { secretsMatch } from '@/lib/secret-compare';
import { enqueueReport } from '@/modules/pipeline/enqueue';
import { listOrgsElegiveisParaGeracao } from '@/modules/scheduler/scheduler.repository';
import {
  ESPACAMENTO_ENTRE_ORGS_MS,
  LOTE_MAXIMO_POR_EXECUCAO,
} from '@/modules/scheduler/scheduler.service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cron diário (Vercel manda `Authorization: Bearer CRON_SECRET`): gera
 * relatórios automaticamente para as orgs cujo ciclo do plano venceu.
 *
 * `listOrgsElegiveisParaGeracao` já filtra a elegibilidade no banco (active +
 * geracao_automatica + Bling ok + ciclo vencido/null); aqui só limitamos o
 * lote e espaçamos as chamadas. Falha em UMA org (try/catch por org) não
 * aborta o lote — as demais continuam sendo processadas.
 */
export async function GET(req: Request): Promise<NextResponse> {
  if (!serverEnv.CRON_SECRET) {
    return NextResponse.json({ error: 'cron_nao_configurado' }, { status: 500 });
  }
  if (!secretsMatch(req.headers.get('authorization'), `Bearer ${serverEnv.CRON_SECRET}`)) {
    return NextResponse.json({ error: 'nao_autorizado' }, { status: 401 });
  }

  const agora = new Date();
  const elegiveis = (await listOrgsElegiveisParaGeracao(agora)).slice(0, LOTE_MAXIMO_POR_EXECUCAO);
  const resultados: { orgId: string; ok: boolean; detalhe: string }[] = [];

  for (const [i, org] of elegiveis.entries()) {
    if (i > 0) await sleep(ESPACAMENTO_ENTRE_ORGS_MS); // espaçamento p/ rate limits
    try {
      const r = await enqueueReport(org.id);
      resultados.push({ orgId: org.id, ok: r.ok, detalhe: r.ok ? r.reportId : r.motivo });
      logger.info('cron.gerar_relatorios.org', { orgId: org.id, ok: r.ok });
    } catch (err) {
      // falha em UMA org não aborta o lote
      resultados.push({ orgId: org.id, ok: false, detalhe: 'erro_inesperado' });
      logger.error(
        'cron.gerar_relatorios.erro',
        { orgId: org.id, erro: err instanceof Error ? err.message : String(err) },
        err,
      );
    }
  }

  return NextResponse.json({ elegiveis: elegiveis.length, resultados });
}
