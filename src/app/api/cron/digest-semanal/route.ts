import { serverEnv } from '@/lib/env';
import { secretsMatch } from '@/lib/secret-compare';
import { processarDigestSemanal } from '@/modules/tasks/digest-semanal';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron semanal (segunda 12h UTC = 9h BRT; Vercel manda `Authorization:
 * Bearer CRON_SECRET`): digest do Plano de Ação por org active com tasks —
 * tasks da semana (concluídas/atrasadas/em andamento) + vendas do mês vs
 * anterior, 1 e-mail por org (best-effort).
 */
export async function GET(req: Request): Promise<Response> {
  if (!serverEnv.CRON_SECRET) {
    return Response.json({ error: 'cron_nao_configurado' }, { status: 500 });
  }
  if (!secretsMatch(req.headers.get('authorization'), `Bearer ${serverEnv.CRON_SECRET}`)) {
    return new Response('unauthorized', { status: 401 });
  }
  const { orgs, enviados } = await processarDigestSemanal(new Date());
  return Response.json({ orgs, enviados });
}
