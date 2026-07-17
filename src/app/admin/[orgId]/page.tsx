import Link from 'next/link';
import { notFound } from 'next/navigation';

import { listAnalistas } from '@/modules/analista/analista.repository';
import { requireAdmin } from '@/modules/auth/require-admin';
import { listOrgUsers } from '@/modules/auth/user.repository';
import {
  getOrgConnectionHealth,
  getOrganizationById,
  listOrgReports,
} from '@/modules/admin/admin.repository';
import { getOrgAnalistaUser } from '@/modules/notifications/recipients';
import { getOrgSettings } from '@/modules/organizations/organization-settings.repository';
import { listTrackedProducts } from '@/modules/tracked-products/tracked-product.repository';
import { StaffTrackedProducts } from '@/components/tracked-products/StaffTrackedProducts';
import { formatData, formatPeriodo } from '@/lib/format';
import { PLANO_LABEL, STATUS_ORG_LABEL } from '@/lib/labels';
import { STATUS_LABEL, reportStatusVariant, type ReportStatus } from '@/modules/reports/report.types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/page-header';
import { Reveal } from '@/components/reveal';
import { AtribuirAnalista } from './atribuir-analista';
import { MetaMensalForm } from './meta-mensal-form';
import { NichoForm } from './nicho-form';
import { OrgUsers } from './org-users';
import { ReportActions } from './report-actions';
import { GenerateNow } from './generate-now';

const SAUDE_BADGE = {
  ok: { variant: 'success', label: 'Conectada' },
  expirado: { variant: 'warn', label: 'Expirada' },
  erro: { variant: 'danger', label: 'Com erro' },
  nenhuma: { variant: 'neutral', label: 'Nunca conectada' },
} as const;

import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: { orgId: string } }): Promise<Metadata> {
  const org = await getOrganizationById(params.orgId);
  return { title: org ? `${org.name} · Cliente` : 'Cliente' };
}

export default async function AdminOrgPage({ params }: { params: { orgId: string } }) {
  await requireAdmin();
  const org = await getOrganizationById(params.orgId);
  if (!org) notFound();

  const [relatorios, saude, produtos, analistas, analistaAtual, settings, usuarios] =
    await Promise.all([
      listOrgReports(org.id),
      getOrgConnectionHealth(org.id),
      listTrackedProducts(org.id),
      listAnalistas(),
      getOrgAnalistaUser(org.id),
      getOrgSettings(org.id),
      listOrgUsers(org.id),
    ]);

  const saudeInfo = SAUDE_BADGE[saude?.saude ?? 'nenhuma'];

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <Link href="/admin" className="text-sm text-muted transition-colors hover:text-white">
        ← Clientes
      </Link>

      <PageHeader eyebrow="Cliente" title={org.name} actions={<GenerateNow orgId={org.id} />}>
        <Badge variant={org.status === 'active' ? 'success' : org.status === 'suspended' ? 'danger' : 'warn'}>
          {STATUS_ORG_LABEL[org.status]}
        </Badge>
        <span className="font-mono text-sm text-muted">{org.plano ? PLANO_LABEL[org.plano] : 'sem plano'}</span>
        <Badge variant={saudeInfo.variant}>{saudeInfo.label}</Badge>
      </PageHeader>

      <Reveal>
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Consultoria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AtribuirAnalista orgId={org.id} analistas={analistas} analistaAtual={analistaAtual} />
          </CardContent>
        </Card>
      </Reveal>

      <Reveal>
        <Card data-testid="org-users-card">
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Usuários ({usuarios.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OrgUsers
              orgId={org.id}
              usuarios={usuarios.map((u) => ({
                id: u.id,
                email: u.email,
                createdAt: formatData(u.created_at),
              }))}
            />
          </CardContent>
        </Card>
      </Reveal>

      <Reveal>
        <Card data-testid="admin-nicho-card">
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Nicho
            </CardTitle>
          </CardHeader>
          <CardContent>
            <NichoForm orgId={org.id} nichoAtual={org.nicho} />
          </CardContent>
        </Card>
      </Reveal>

      <Reveal>
        <Card data-testid="meta-mensal-card">
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Meta mensal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MetaMensalForm orgId={org.id} metaAtual={settings?.metaMensal ?? null} />
          </CardContent>
        </Card>
      </Reveal>

      <Reveal>
        <Tabs
        defaultValue="relatorios"
        items={[
          {
            id: 'relatorios',
            label: `Relatórios (${relatorios.length})`,
            content:
              relatorios.length === 0 ? (
                <EmptyState title="Nenhum relatório gerado." description="Use “Gerar relatório agora” para disparar o primeiro." />
              ) : (
                <Card className="!p-0">
                  <Table data-testid="admin-org-reports">
                    <THead>
                      <TR>
                        <TH>Status</TH>
                        <TH>Etapa</TH>
                        <TH>Período</TH>
                        <TH>Criado</TH>
                        <TH>Erro</TH>
                        <TH>IA (tokens)</TH>
                        <TH>
                          <span className="sr-only">Ações</span>
                        </TH>
                      </TR>
                    </THead>
                    <TBody>
                      {relatorios.map((r) => (
                        <TR key={r.id}>
                          <TD>
                            <Badge variant={reportStatusVariant(r.status)}>
                              {STATUS_LABEL[r.status as ReportStatus] ?? r.status}
                            </Badge>
                          </TD>
                          <TD className="font-mono text-xs text-muted">{r.etapa ?? '—'}</TD>
                          <TD className="text-muted">{formatPeriodo(r.periodoInicio, r.periodoFim)}</TD>
                          <TD className="text-muted">{formatData(r.createdAt)}</TD>
                          {/* admin VÊ o erro cru — é a tela de operação */}
                          <TD className="font-mono text-xs text-danger-fg">
                            <span className="block max-w-56 truncate" title={r.erro ?? undefined}>
                              {r.erro ?? '—'}
                            </span>
                          </TD>
                          <TD className="font-mono text-xs text-muted">
                            {r.iaUsage
                              ? `${r.iaUsage.input_tokens.toLocaleString('pt-BR')} → ${r.iaUsage.output_tokens.toLocaleString('pt-BR')}`
                              : '—'}
                          </TD>
                          <TD>{r.status === 'failed' ? <ReportActions reportId={r.id} /> : null}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </Card>
              ),
          },
          {
            id: 'conexao',
            label: 'Conexão',
            content: (
              <Card>
                <CardHeader>
                  <CardTitle as="h2" className="text-base">
                    Bling
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="flex items-center gap-2">
                    <Badge variant={saudeInfo.variant}>{saudeInfo.label}</Badge>
                  </p>
                  <p className="text-muted">
                    Token expira em:{' '}
                    <span className="font-mono text-white/80">
                      {saude?.expiraEm ? formatData(saude.expiraEm) : '—'}
                    </span>
                  </p>
                  <p className="text-muted">
                    Última sincronização:{' '}
                    <span className="font-mono text-white/80">
                      {saude?.lastSyncAt ? formatData(saude.lastSyncAt) : '—'}
                    </span>
                  </p>
                </CardContent>
              </Card>
            ),
          },
          {
            id: 'produtos',
            label: `Produtos (${produtos.length})`,
            content: (
              <Card>
                <CardContent>
                  <StaffTrackedProducts
                    orgId={org.id}
                    produtos={produtos.map((p) => ({
                      id: p.id,
                      nome: p.nome,
                      sku: p.sku,
                      keywords: p.keywords,
                    }))}
                  />
                </CardContent>
              </Card>
            ),
          },
        ]}
        />
      </Reveal>
    </main>
  );
}
