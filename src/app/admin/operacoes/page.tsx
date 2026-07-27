import type { Metadata } from 'next';

import { PageHeader } from '@/components/page-header';
import { Reveal } from '@/components/reveal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { formatDataHora } from '@/lib/format';
import { fimDeDiaUtc, hojeBrt, inicioDeDiaUtc } from '@/lib/timezone';
import { listClientOrganizations } from '@/modules/admin/admin.repository';
import { OPUS_INPUT_USD_PER_MTOK, OPUS_OUTPUT_USD_PER_MTOK, custoIaDoMes } from '@/modules/admin/custo-ia';
import { listHeartbeats } from '@/modules/admin/heartbeat.repository';
import {
  listAuditLogFiltrado,
  listConexoesSaude,
  listFilaRelatorios,
  listReportsUsageMes,
  type ConexaoOrgRow,
} from '@/modules/admin/operacoes.repository';
import { statusDosCrons } from '@/modules/admin/operacoes-view';
import { requireAdmin } from '@/modules/auth/require-admin';
import { STATUS_LABEL, reportStatusVariant, type ReportStatus } from '@/modules/reports/report.types';
import { ReprocessarButton } from './reprocessar-button';

export const metadata: Metadata = { title: 'Admin · Operações' };

/** Janela da fila cross-org (spec: "últimos 30d"). */
const JANELA_FILA_DIAS = 30;

const SAUDE_BADGE: Record<ConexaoOrgRow['saude'], { variant: 'success' | 'warn' | 'danger' | 'neutral'; label: string }> = {
  ok: { variant: 'success', label: 'Conectada' },
  expirado: { variant: 'warn', label: 'Expirada' },
  erro: { variant: 'danger', label: 'Com erro' },
  nenhuma: { variant: 'neutral', label: 'Nunca conectada' },
};

type SearchParams = {
  orgId?: string;
  acao?: string;
  desde?: string;
  ate?: string;
  page?: string;
};

export default async function OperacoesPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  await requireAdmin();
  const agora = new Date();

  const hoje = hojeBrt(agora);
  const inicioMes = inicioDeDiaUtc(`${hoje.slice(0, 7)}-01`);
  const fimMes = fimDeDiaUtc(hoje);
  const desdeFila = new Date(agora.getTime() - JANELA_FILA_DIAS * 24 * 60 * 60 * 1000);

  const auditPage = Math.max(1, Number(searchParams.page) || 1);
  const auditOrgId = searchParams.orgId?.trim() || undefined;
  const auditAcao = searchParams.acao?.trim() || undefined;
  const auditDesde = searchParams.desde ? inicioDeDiaUtc(searchParams.desde) : undefined;
  const auditAte = searchParams.ate ? fimDeDiaUtc(searchParams.ate) : undefined;

  const [heartbeats, fila, usageMes, conexoes, auditoria, orgsParaFiltro] = await Promise.all([
    listHeartbeats(),
    listFilaRelatorios(desdeFila),
    listReportsUsageMes(inicioMes, fimMes),
    listConexoesSaude(agora),
    listAuditLogFiltrado({ orgId: auditOrgId, acao: auditAcao, desde: auditDesde, ate: auditAte, page: auditPage }),
    listClientOrganizations(),
  ]);

  const crons = statusDosCrons(heartbeats, agora);
  const custo = custoIaDoMes(usageMes);
  const orgNamePorId = new Map(usageMes.map((r) => [r.orgId, r.orgName]));

  const hrefFor = (p: number) => {
    const qs = new URLSearchParams();
    if (auditOrgId) qs.set('orgId', auditOrgId);
    if (auditAcao) qs.set('acao', auditAcao);
    if (searchParams.desde) qs.set('desde', searchParams.desde);
    if (searchParams.ate) qs.set('ate', searchParams.ate);
    qs.set('page', String(p));
    return `/admin/operacoes?${qs.toString()}`;
  };

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6 md:p-8" data-testid="operacoes-page">
      <PageHeader
        eyebrow="Operação Truth"
        title="Centro de operações"
        description="Crons, fila de relatórios, custo de IA do mês, conexões e auditoria — visão cross-org do que está rodando agora."
      />

      {/* 1. Crons */}
      <Reveal>
        <Card data-testid="operacoes-crons">
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Crons
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Rota</TH>
                  <TH>Última execução</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {crons.map((c) => (
                  <TR key={c.rota} data-testid={`operacoes-cron-${c.rota}`}>
                    <TD>{c.label}</TD>
                    <TD className="text-muted">
                      {c.executadoEm ? formatDataHora(c.executadoEm) : 'nunca executou'}
                    </TD>
                    <TD>
                      <Badge variant={c.badge === 'ok' ? 'success' : 'danger'}>
                        {c.badge === 'ok' ? (c.ok === false ? 'ok (última falhou)' : 'ok') : 'atrasado'}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </Reveal>

      {/* 2. Fila de relatórios */}
      <Reveal className="space-y-3" data-testid="operacoes-fila">
        <h2 className="font-heading text-lg font-semibold text-ink">
          Fila de relatórios <span className="text-muted">({fila.length})</span>
        </h2>
        {fila.length === 0 ? (
          <EmptyState
            data-testid="operacoes-fila-vazia"
            title="Nenhum relatório na fila."
            description="Nada queued, running ou failed nos últimos 30 dias."
          />
        ) : (
          <Card className="!p-0">
            <Table data-testid="operacoes-fila-table">
              <THead>
                <TR>
                  <TH>Cliente</TH>
                  <TH>Status</TH>
                  <TH>Etapa</TH>
                  <TH>Erro</TH>
                  <TH>Criado</TH>
                  <TH>
                    <span className="sr-only">Ações</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {fila.map((f) => (
                  <TR key={f.id} data-testid={`operacoes-fila-row-${f.id}`}>
                    <TD>{f.orgName}</TD>
                    <TD>
                      <Badge variant={reportStatusVariant(f.status)}>
                        {STATUS_LABEL[f.status as ReportStatus] ?? f.status}
                      </Badge>
                    </TD>
                    <TD className="font-mono text-xs text-muted">{f.etapa ?? '—'}</TD>
                    <TD className="font-mono text-xs text-danger-fg">
                      <span className="block max-w-56 truncate" title={f.erro ?? undefined}>
                        {f.erro ?? '—'}
                      </span>
                    </TD>
                    <TD className="text-muted">{formatDataHora(f.createdAt)}</TD>
                    <TD>{f.status === 'failed' ? <ReprocessarButton reportId={f.id} /> : null}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </Reveal>

      {/* 3. Custo IA do mês */}
      <Reveal className="space-y-3" data-testid="operacoes-custo-ia">
        <h2 className="font-heading text-lg font-semibold text-ink">Custo IA do mês</h2>
        <p className="text-xs text-muted">
          Estimado com os preços atuais do Opus: US$ {OPUS_INPUT_USD_PER_MTOK}/Mtok de entrada, US${' '}
          {OPUS_OUTPUT_USD_PER_MTOK}/Mtok de saída.
        </p>
        <Card className="!p-0">
          <Table>
            <THead>
              <TR>
                <TH>Cliente</TH>
                <TH>Tokens entrada</TH>
                <TH>Tokens saída</TH>
                <TH>Chamadas</TH>
                <TH>Custo estimado</TH>
              </TR>
            </THead>
            <TBody>
              {custo.porOrg.length === 0 ? (
                <TR>
                  <td className="px-4 py-6 text-center text-muted" colSpan={5}>
                    Nenhum relatório com uso de IA neste mês.
                  </td>
                </TR>
              ) : (
                custo.porOrg.map((o) => (
                  <TR key={o.orgId} data-testid={`operacoes-custo-org-${o.orgId}`}>
                    <TD>{orgNamePorId.get(o.orgId) ?? o.orgId}</TD>
                    <TD numeric>{o.inputTokens.toLocaleString('pt-BR')}</TD>
                    <TD numeric>{o.outputTokens.toLocaleString('pt-BR')}</TD>
                    <TD numeric>{o.chamadas}</TD>
                    <TD numeric>US$ {o.custoUsd.toFixed(2)}</TD>
                  </TR>
                ))
              )}
            </TBody>
            {custo.porOrg.length > 0 ? (
              <tfoot>
                <TR className="border-t border-line">
                  <TD className="font-semibold text-ink">Total</TD>
                  <TD numeric className="font-semibold text-ink">
                    {custo.total.inputTokens.toLocaleString('pt-BR')}
                  </TD>
                  <TD numeric className="font-semibold text-ink">
                    {custo.total.outputTokens.toLocaleString('pt-BR')}
                  </TD>
                  <TD numeric className="font-semibold text-ink">
                    {custo.total.chamadas}
                  </TD>
                  <TD numeric className="font-semibold text-ink" data-testid="operacoes-custo-total">
                    US$ {custo.total.custoUsd.toFixed(2)}
                  </TD>
                </TR>
              </tfoot>
            ) : null}
          </Table>
        </Card>
      </Reveal>

      {/* 4. Conexões */}
      <Reveal className="space-y-3" data-testid="operacoes-conexoes">
        <h2 className="font-heading text-lg font-semibold text-ink">Conexões</h2>
        <Card className="!p-0">
          <Table>
            <THead>
              <TR>
                <TH>Cliente</TH>
                <TH>Conexão</TH>
                <TH>Expira em</TH>
                <TH>Última sincronização</TH>
              </TR>
            </THead>
            <TBody>
              {conexoes.map((c) => (
                <TR key={c.orgId} data-testid={`operacoes-conexao-${c.orgId}`}>
                  <TD>{c.orgName}</TD>
                  <TD>
                    <Badge variant={SAUDE_BADGE[c.saude].variant}>{SAUDE_BADGE[c.saude].label}</Badge>
                  </TD>
                  <TD className="font-mono text-muted">
                    {c.diasAteExpirar !== null ? `${c.diasAteExpirar}d` : '—'}
                  </TD>
                  <TD className="text-muted">{c.lastSyncAt ? formatDataHora(c.lastSyncAt) : '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </Reveal>

      {/* 5. Audit log */}
      <Reveal className="space-y-3" data-testid="operacoes-audit">
        <h2 className="font-heading text-lg font-semibold text-ink">
          Auditoria <span className="text-muted">({auditoria.total})</span>
        </h2>
        <form
          method="get"
          action="/admin/operacoes"
          className="flex flex-wrap items-end gap-2"
          data-testid="operacoes-audit-filtros"
        >
          <Select name="orgId" defaultValue={auditOrgId ?? ''} className="!w-auto" aria-label="Filtrar por cliente">
            <option value="">Todos os clientes</option>
            {orgsParaFiltro.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
          <Input
            type="text"
            name="acao"
            defaultValue={auditAcao ?? ''}
            placeholder="Ação (ex.: report.reprocessado)…"
            aria-label="Filtrar por ação"
            className="!w-56"
          />
          <Input
            type="date"
            name="desde"
            defaultValue={searchParams.desde ?? ''}
            aria-label="Data inicial"
            className="!w-auto"
          />
          <Input
            type="date"
            name="ate"
            defaultValue={searchParams.ate ?? ''}
            aria-label="Data final"
            className="!w-auto"
          />
          <Button type="submit" variant="secondary" size="sm">
            Filtrar
          </Button>
        </form>

        {auditoria.items.length === 0 ? (
          <EmptyState
            data-testid="operacoes-audit-vazia"
            title="Nenhum registro de auditoria para esse filtro."
          />
        ) : (
          <Card className="!p-0">
            <Table data-testid="operacoes-audit-table">
              <THead>
                <TR>
                  <TH>Quando</TH>
                  <TH>Cliente</TH>
                  <TH>Ação</TH>
                  <TH>Detalhes</TH>
                </TR>
              </THead>
              <TBody>
                {auditoria.items.map((a) => (
                  <TR key={a.id}>
                    <TD className="text-muted">{formatDataHora(a.createdAt)}</TD>
                    <TD>{a.orgName ?? '—'}</TD>
                    <TD className="font-mono text-xs">{a.acao}</TD>
                    <TD className="font-mono text-xs text-muted">
                      <span className="block max-w-72 truncate">
                        {a.detalhes ? JSON.stringify(a.detalhes) : '—'}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}

        <Pagination page={auditPage} pageCount={auditoria.pageCount} hrefFor={hrefFor} />
      </Reveal>
    </main>
  );
}
