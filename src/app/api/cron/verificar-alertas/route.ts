import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { secretsMatch } from '@/lib/secret-compare';
import { registrarHeartbeat } from '@/modules/admin/heartbeat.repository';
import {
  detectarConcorrenteAbaixo,
  detectarEstoqueCritico,
  detectarProdutoParado,
  detectarQuedaVendas,
  filtrarNaoDuplicados,
  type AlertaCandidato,
} from '@/modules/alerts/alert-detectors';
import {
  getPosicaoPrecoUltimoDone,
  getTotaisSemanais,
  getUltimaDataPedido,
  getUltimaVendaPorSku,
  listOrgsComRelatorioRecente,
} from '@/modules/alerts/alert-data.repository';
import {
  criarAlertas,
  listAlertasParaDedup,
} from '@/modules/alerts/alert.repository';
import {
  JANELA_RELATORIO_RECENTE_DIAS,
  PRODUTO_HISTORICO_DIAS,
} from '@/modules/alerts/alerts.constants';
import { montarCobertura } from '@/modules/estoque/stock-coverage';
import { getStockRows, getVendas30dPorSku } from '@/modules/estoque/stock.repository';
import { sendAlertasDigestEmail } from '@/modules/notifications/email';
import { notify } from '@/modules/notifications/notification.repository';
import { getOrgPrimaryUser } from '@/modules/notifications/recipients';
import { processarLembretesDePrazo } from '@/modules/tasks/lembretes-prazo';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron diário (Vercel manda `Authorization: Bearer CRON_SECRET`): roda os
 * detectores de alertas para cada org com relatório recente e persiste os
 * novos com dedup + notificação.
 *
 * Verdade dos dados (G0):
 * - FRESCOR: as janelas de queda/produto parado são ancoradas no "agora
 *   efetivo" = MAX(orders.data) da org — se o dado parou de sincronizar, as
 *   janelas param junto (zero falso "queda de 100%"). Org sem pedido algum
 *   pula esses detectores; concorrente_preco continua (lê posicaoPreco do
 *   último relatório done, não a tabela orders).
 * - COOLDOWN: dedup contra abertos + resolvidos nos últimos 7 dias.
 * - DIGEST: 1 e-mail por org por execução com TODOS os alertas novos;
 *   in-app continua 1 notificação por alerta.
 * - CORRIDA: criarAlertas usa ON CONFLICT DO NOTHING (índice único parcial).
 *
 * Falha em UMA org (try/catch por org) não aborta o lote; notificação é
 * best-effort aninhada.
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
      const agoraEfetivo = await getUltimaDataPedido(orgId);

      const [semanais, posicao, parado, dedupBase, stockRows, vendas30d] = await Promise.all([
        agoraEfetivo ? getTotaisSemanais(orgId, agoraEfetivo) : Promise.resolve(null),
        getPosicaoPrecoUltimoDone(orgId),
        agoraEfetivo
          ? getUltimaVendaPorSku(orgId, PRODUTO_HISTORICO_DIAS, agoraEfetivo)
          : Promise.resolve(null),
        listAlertasParaDedup(orgId, agora),
        getStockRows(orgId),
        agoraEfetivo ? getVendas30dPorSku(orgId, agoraEfetivo) : Promise.resolve(new Map<string, number>()),
      ]);

      const queda = semanais ? detectarQuedaVendas(semanais) : null;
      const candidatos: AlertaCandidato[] = [
        ...(queda ? [queda] : []),
        ...detectarConcorrenteAbaixo(posicao),
        ...(parado && agoraEfetivo
          ? detectarProdutoParado(parado.produtos, parado.ultimaVendaPorSku, agoraEfetivo)
          : []),
        ...(agoraEfetivo && stockRows.length > 0
          ? detectarEstoqueCritico(montarCobertura(stockRows, vendas30d))
          : []),
      ];
      const novos = filtrarNaoDuplicados(candidatos, dedupBase);
      if (novos.length === 0) continue;

      const idsCriados = await criarAlertas(orgId, novos);
      if (idsCriados.length === 0) continue; // corrida: outra execução criou antes
      criadosTotal += idsCriados.length;

      // Notificação — best-effort, nunca aborta o cron.
      // In-app: 1 por alerta. E-mail: DIGEST único com todos os novos.
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
          }
          await sendAlertasDigestEmail(
            user.email,
            novos.map((n) => ({ titulo: n.titulo, corpo: n.corpo })),
          );
        }
      } catch (err) {
        logger.warn('cron.verificar_alertas.notificacao_falhou', {
          orgId,
          erro: err instanceof Error ? err.message : String(err),
        });
      }
      logger.info('cron.verificar_alertas.org', { orgId, criados: idsCriados.length });
    } catch (err) {
      logger.error('cron.verificar_alertas.erro', {
        orgId,
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // G3: cobrança de prazos — independente do loop de alertas (cobre TODA org
  // active com task, não só as com relatório recente).
  let lembretesEnviados = 0;
  try {
    lembretesEnviados = await processarLembretesDePrazo(agora);
  } catch (err) {
    logger.error('cron.lembretes_prazo.erro', { erro: err instanceof Error ? err.message : String(err) });
  }

  const resposta = { orgs: orgIds.length, alertasCriados: criadosTotal, lembretesEnviados };
  await registrarHeartbeat('verificar-alertas', true, resposta);
  return Response.json(resposta);
}
