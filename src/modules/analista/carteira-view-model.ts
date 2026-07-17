/**
 * View-model puro do command center do analista (H4 T5) — testável em node,
 * sem I/O. Consome `OrgResumo[]` (T3) e `RiscoOrg` (T2) já calculados; aqui só
 * ordena, corta motivos e mapeia rótulos/variants para a UI.
 */
import type { OrgResumo } from '@/modules/analista/carteira-data.repository';
import type { RiscoOrg } from '@/modules/analista/score-risco';

const TOP_MOTIVOS = 3;

/** Ordena orgs por `risco.score` desc; empate por `orgName` asc (pt-BR) — mesmo critério de desempate de `getCarteira`. */
export function ordenarPorRisco(resumos: OrgResumo[]): OrgResumo[] {
  return [...resumos].sort(
    (a, b) => b.risco.score - a.risco.score || a.orgName.localeCompare(b.orgName, 'pt-BR'),
  );
}

/**
 * Orgs que precisam de atenção (`risco.nivel !== 'ok'`), ordenadas por
 * `risco.score` desc (mesmo critério de `ordenarPorRisco`). Fonte de dados
 * da fila "Atenção hoje" — orgs 'ok' não entram na fila.
 */
export function orgsQuePrecisamAtencao(resumos: OrgResumo[]): OrgResumo[] {
  return ordenarPorRisco(resumos).filter((r) => r.risco.nivel !== 'ok');
}

/** Top-3 motivos — `calcularRisco` (T2) já devolve `motivos` ordenados por peso desc. */
export function top3Motivos(motivos: string[]): string[] {
  return motivos.slice(0, TOP_MOTIVOS);
}

/**
 * Nível de risco → variant real do Badge (src/components/ui/Badge.tsx) +
 * rótulo pt-BR. Mesmo padrão de `badgeDoEstado` (estoque-view-model.ts).
 */
export function badgeDoNivel(nivel: RiscoOrg['nivel']): { variant: 'danger' | 'warn' | 'success'; label: string } {
  switch (nivel) {
    case 'critico':
      return { variant: 'danger', label: 'Crítico' };
    case 'atencao':
      return { variant: 'warn', label: 'Atenção' };
    case 'ok':
      return { variant: 'success', label: 'Ok' };
  }
}

/**
 * Motivo de conexão/token — reconhece os textos que `insumoConexao`
 * (score-risco.ts) produz ('Conexão Bling expirada' / 'Conexão Bling
 * expirando em breve'); usado para decidir se a linha ganha o link extra
 * "Conexões". NOTA: 'Erro na conexão Bling' é uma falha de integração, não
 * um problema de token — não dispara o link (o texto começa com minúscula
 * de propósito, para não casar com o prefixo 'Conexão').
 */
export function motivoEhConexao(motivo: string): boolean {
  return motivo.startsWith('Conexão Bling');
}

export type FilaAtencaoRow = {
  orgId: string;
  orgName: string;
  nicho: string | null;
  score: number;
  nivel: RiscoOrg['nivel'];
  motivosTop3: string[];
  mostrarLinkConexoes: boolean;
};

/**
 * Monta a fila "Atenção hoje" do command center: só as orgs da carteira
 * (escopo já resolvido por `carteiraResumo`, nunca por `access.orgId`) que
 * precisam de atenção (`risco.nivel !== 'ok'`, via `orgsQuePrecisamAtencao`),
 * ordenadas por risco desc, com os top-3 motivos e a flag do link de
 * Conexões quando o motivo de maior risco é de token.
 */
export function filaAtencaoHoje(resumos: OrgResumo[]): FilaAtencaoRow[] {
  return orgsQuePrecisamAtencao(resumos).map((r) => ({
    orgId: r.orgId,
    orgName: r.orgName,
    nicho: r.nicho,
    score: r.risco.score,
    nivel: r.risco.nivel,
    motivosTop3: top3Motivos(r.risco.motivos),
    mostrarLinkConexoes: r.risco.motivos.some(motivoEhConexao),
  }));
}
