import { blingProvider } from '@/modules/providers/bling/provider';
import { upsertStock } from '@/modules/estoque/stock.repository';

/**
 * Sincroniza o snapshot de estoque de UMA org. Erros do Bling propagam —
 * o chamador (cron) faz try/catch por org (padrão sincronizarPedidosDaOrg).
 */
export async function sincronizarEstoqueDaOrg(orgId: string): Promise<{ produtos: number }> {
  const itens = await blingProvider.fetchStock(orgId);
  const produtos = await upsertStock(orgId, itens);
  return { produtos };
}
