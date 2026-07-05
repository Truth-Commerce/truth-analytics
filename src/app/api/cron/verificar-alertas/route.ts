import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { secretsMatch } from '@/lib/secret-compare';
import {
  detectarConcorrenteAbaixo,
  detectarProdutoParado,
  detectarQuedaVendas,
  filtrarNaoDuplicados,
  type AlertaCandidato,
} from '@/modules/alerts/alert-detectors';
import {
  getPosicaoPrecoUltimoDone,
  getTotaisSemanais,
  getUltimaVendaPorSku,
  listOrgsComRelatorioRecente,
} from '@/modules/alerts/alert-data.repository';
import {
  criarAlertas,
  listAlertasAbertos,
} from '@/modules/alerts/alert.repository';
import {
  JANELA_RELATORIO_RECENTE_DIAS,
  PRODUTO_HISTORICO_DIAS,
} from '@/modules/alerts/alerts.constants';
import { sendAlertaEmail } from '@/modules/notifications/email';
import { notify } from '@/modules/notifications/notification.repository';
import { getOrgPrimaryUser } from '@/modules/notifications/recipients';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron diário (Vercel manda `Authorization: Bearer CRON_SECRET`): roda os
 * detectores de alertas (queda de vendas, concorrente abaixo do preço, produto
 * parado) para cada org com relatório recente, deduplica contra os alertas já
 * abertos, persiste os novos e notifica o cliente (in-app + e-mail).
 *
 * Falha em UMA org (try/catch por org) não aborta o lote. A notificação é
 * best-effort num try/catch aninhado — falha ao notificar não desfaz os
 * alertas já persistidos nem interrompe o processamento das demais orgs.
 */
export async function GET(req: Request): Promise<Response> {
  if (!serverEnv.CRON_SECRET) {
    return Response.json({ error: 'cron_nao_configurado' }, { status: 500 });
  }
  if (!secretsMatch(req.headers.get('authorization'), `Bearer ${serverEnv.CRON_SECRET}`)) {
    return new Response('unauthorized', { status: 401 });
  }

  const agora = new Date();
  const orgIds = await listOrgsComRelatorioRecente(JANELA_RELATORIO_RECENTE_DIAS, agora);
  let criadosTotal = 0;

  for (const orgId of orgIds) {
    try {
      const [semanais, posicao, parado, abertos] = await Promise.all([
        getTotaisSemanais(orgId, agora),
        getPosicaoPrecoUltimoDone(orgId),
        getUltimaVendaPorSku(orgId, PRODUTO_HISTORICO_DIAS, agora),
        listAlertasAbertos(orgId),
      ]);

      const queda = detectarQuedaVendas(semanais);
      const candidatos: AlertaCandidato[] = [
        ...(queda ? [queda] : []),
        ...detectarConcorrenteAbaixo(posicao),
        ...detectarProdutoParado(parado.produtos, parado.ultimaVendaPorSku, agora),
      ];
      const novos = filtrarNaoDuplicados(
        candidatos,
        abertos.map((a) => ({ tipo: a.tipo, chaveDedup: a.chaveDedup })),
      );
      if (novos.length === 0) continue;

      await criarAlertas(orgId, novos);
      criadosTotal += novos.length;

      // Notificação in-app + e-mail — best-effort, nunca aborta o cron.
      try {
        const user = await getOrgPrimaryUser(orgId);
        if (user) {
          for (const n of novos) {
            await notify(user.id, {
              tipo: `alerta_${n.tipo}`,
              titulo: n.titulo,
              corpo: n.corpo,
              href: '/dashboard',
            });
            await sendAlertaEmail(user.email, n.titulo, n.corpo);
          }
        }
      } catch (err) {
        logger.warn('cron.verificar_alertas.notificacao_falhou', {
          orgId,
          erro: err instanceof Error ? err.message : String(err),
        });
      }
      logger.info('cron.verificar_alertas.org', { orgId, criados: novos.length });
    } catch (err) {
      logger.error('cron.verificar_alertas.erro', {
        orgId,
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({ orgs: orgIds.length, alertasCriados: criadosTotal });
}
