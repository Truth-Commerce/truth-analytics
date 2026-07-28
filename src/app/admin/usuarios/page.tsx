import type { Metadata } from 'next';

import { PageHeader } from '@/components/page-header';
import { Reveal } from '@/components/reveal';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { formatDataHora } from '@/lib/format';
import { listAnalistas } from '@/modules/analista/analista.repository';
import { requireAdmin } from '@/modules/auth/require-admin';
import { listUsersPage } from '@/modules/auth/user.repository';
import type { UserRole } from '@/modules/auth/user.types';

import { CriarAnalistaForm } from './criar-analista-form';
import { CriarClienteForm } from './criar-cliente-form';
import { ResetLinkButton } from './reset-link-button';
import { TransferirCarteiraForm } from './transferir-carteira-form';

export const metadata: Metadata = { title: 'Admin · Usuários' };

const ROLE_BADGE: Record<UserRole, { variant: 'mono' | 'success' | 'neutral'; label: string }> = {
  admin_truth: { variant: 'mono', label: 'admin_truth' },
  analista: { variant: 'success', label: 'analista' },
  client: { variant: 'neutral', label: 'client' },
};

type SearchParams = { q?: string; page?: string };

export default async function AdminUsuariosPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  await requireAdmin();

  const page = Math.max(1, Number(searchParams.page) || 1);
  const q = searchParams.q?.trim() || undefined;

  const [usuarios, analistas] = await Promise.all([
    listUsersPage({ q, page }),
    listAnalistas(),
  ]);

  const hrefFor = (p: number) => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    qs.set('page', String(p));
    return `/admin/usuarios?${qs.toString()}`;
  };

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6 md:p-8" data-testid="usuarios-page">
      <PageHeader
        eyebrow="Operação Truth"
        title="Gestão de contas"
        description="Crie empresas com seu primeiro acesso, cadastre analistas internos, redefina senhas e organize a carteira da operação."
      />

      {/* 1. Provisionar cliente ou analista */}
      <section className="grid gap-5 lg:grid-cols-2" aria-label="Criar contas">
        <Reveal className="h-full">
          <Card className="h-full" data-testid="usuarios-criar-cliente-card">
            <CardHeader>
              <CardTitle as="h2" className="text-base">
                Criar conta de cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CriarClienteForm />
            </CardContent>
          </Card>
        </Reveal>

        <Reveal className="h-full">
          <Card className="h-full" data-testid="usuarios-criar-analista-card">
            <CardHeader>
              <CardTitle as="h2" className="text-base">
                Criar conta de analista
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CriarAnalistaForm />
            </CardContent>
          </Card>
        </Reveal>
      </section>

      {/* 2. Transferir carteira em lote */}
      <Reveal>
        <Card data-testid="usuarios-transferir-card">
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Transferir carteira em lote
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analistas.length < 2 ? (
              <EmptyState
                data-testid="usuarios-transferir-vazio"
                title="É preciso ao menos 2 analistas cadastrados."
                description="Crie mais um analista acima para poder transferir a carteira."
              />
            ) : (
              <TransferirCarteiraForm analistas={analistas} />
            )}
          </CardContent>
        </Card>
      </Reveal>

      {/* 3. Lista cross-org */}
      <Reveal className="space-y-3" data-testid="usuarios-lista">
        <h2 className="font-heading text-lg font-semibold text-ink">
          Usuários <span className="text-muted">({usuarios.total})</span>
        </h2>

        <form
          method="get"
          action="/admin/usuarios"
          className="flex flex-wrap items-end gap-2"
          data-testid="usuarios-busca-form"
        >
          <Input
            type="text"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Buscar por e-mail ou organização…"
            aria-label="Buscar por e-mail ou organização"
            className="!w-72"
          />
          <Button type="submit" variant="secondary" size="sm">
            Buscar
          </Button>
        </form>

        {usuarios.items.length === 0 ? (
          <EmptyState data-testid="usuarios-vazia" title="Nenhum usuário encontrado para essa busca." />
        ) : (
          <Card className="!p-0">
            <Table data-testid="usuarios-table">
              <THead>
                <TR>
                  <TH>E-mail</TH>
                  <TH>Organização</TH>
                  <TH>Papel</TH>
                  <TH>Criado em</TH>
                  <TH>
                    <span className="sr-only">Ações</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {usuarios.items.map((u) => (
                  <TR key={u.id} data-testid={`usuarios-row-${u.id}`}>
                    <TD className="font-mono text-xs">{u.email}</TD>
                    <TD>{u.orgName}</TD>
                    <TD>
                      <Badge variant={ROLE_BADGE[u.role].variant}>{ROLE_BADGE[u.role].label}</Badge>
                    </TD>
                    <TD className="text-muted">{formatDataHora(u.createdAt)}</TD>
                    <TD>
                      <ResetLinkButton userId={u.id} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}

        <Pagination page={page} pageCount={usuarios.pageCount} hrefFor={hrefFor} />
      </Reveal>
    </main>
  );
}
