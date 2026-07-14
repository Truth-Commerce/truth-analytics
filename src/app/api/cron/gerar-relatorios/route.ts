import { NextResponse } from 'next/server';

import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { secretsMatch } from '@/lib/secret-compare';
import { sendAutoGeracaoPausadaEmail } from '@/modules/notifications/email';
import { getAdminAlertEmail } from '@/modules/notifications/recipients';
import { enqueueReport } from '@/modules/pipeline/enqueue';
import { setGeracaoAutomatica } from '@/modules/organizations/organization-settings.repository';
import {
  listOrgsComFalhasConsecutivas,
  listOrgsElegiveisParaGeracao,
} from '@/modules/scheduler/scheduler.repository';
import {
  ESPACAMENTO_ENTRE_ORGS_MS,
  FALHAS_CONSECUTIVAS_PAUSA,
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

  // G0 (backoff): 3 relatórios failed consecutivos → desliga a auto-geração e
  // avisa o admin (best-effort). Roda ANTES da listagem — a org pausada some
  // da elegibilidade nesta mesma execução.
  let pausadas = 0;
  try {
    const quebradas = await listOrgsComFalhasConsecutivas(FALHAS_CONSECUTIVAS_PAUSA);
    for (const org of quebradas) {
      await setGeracaoAutomatica(org.id, false);
      pausadas++;
      logger.warn('cron.gerar_relatorios.auto_pausada', { orgId: org.id });
      const adminEmail = getAdminAlertEmail();
      if (adminEmail) await sendAutoGeracaoPausadaEmail(adminEmail, org.name, org.id);
    }
  } catch (err) {
    logger.error('cron.gerar_relatorios.pausa_falhou', {
      erro: err instanceof Error ? err.message : String(err),
    });
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

  return NextResponse.json({ elegiveis: elegiveis.length, pausadas, resultados });
}
