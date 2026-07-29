import type { Metadata } from 'next';

import { PageHeader } from '@/components/page-header';
import { Reveal } from '@/components/reveal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Table, TBody, TH, THead, TR } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { formatDataHora } from '@/lib/format';
import { listClientesPage, listEquipePage } from '@/modules/admin/staff-accounts.repository';
import { listAnalistas } from '@/modules/analista/analista.repository';
import { requireAdmin } from '@/modules/auth/require-admin';

import { ClienteRow } from './cliente-row';
import { CriarAnalistaForm } from './criar-analista-form';
import { CriarClienteForm } from './criar-cliente-form';
import { EquipeRow } from './equipe-row';
import { TransferirCarteiraForm } from './transferir-carteira-form';

export const metadata: Metadata = { title: 'Admin · Contas' };

type Aba = 'equipe' | 'clientes';
type SearchParams = { aba?: string; q?: string; page?: string };

function abaDe(valor: string | undefined): Aba {
  return valor === 'clientes' ? 'clientes' : 'equipe';
}

/**
 * Gestão de contas dividida em duas: a equipe interna da Truth (analistas e
 * admins) e as contas de acesso dos clientes. A aba ativa viaja na URL para
 * que busca e paginação não joguem o admin de volta na primeira aba.
 */
export default async function AdminUsuariosPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  await requireAdmin();

  const aba = abaDe(searchParams.aba);
  const page = Math.max(1, Number(searchParams.page) || 1);
  const q = searchParams.q?.trim() || undefined;

  // Só a aba visível é buscada/paginada; a outra abre na primeira página.
  const [equipe, clientes, analistas] = await Promise.all([
    listEquipePage({ q: aba === 'equipe' ? q : undefined, page: aba === 'equipe' ? page : 1 }),
    listClientesPage({ q: aba === 'clientes' ? q : undefined, page: aba === 'clientes' ? page : 1 }),
    listAnalistas(),
  ]);

  const hrefFor = (alvo: Aba) => (p: number) => {
    const qs = new URLSearchParams();
    qs.set('aba', alvo);
    if (q && aba === alvo) qs.set('q', q);
    qs.set('page', String(p));
    return `/admin/usuarios?${qs.toString()}`;
  };

  const busca = (alvo: Aba, placeholder: string) => (
    <form
      method="get"
      action="/admin/usuarios"
      className="flex flex-wrap items-end gap-2"
      data-testid={`busca-${alvo}`}
    >
      <input type="hidden" name="aba" value={alvo} />
      <Input
        type="text"
        name="q"
        defaultValue={aba === alvo ? (q ?? '') : ''}
        placeholder={placeholder}
        aria-label={placeholder}
        className="!w-72"
      />
      <Button type="submit" variant="secondary" size="sm">
        Buscar
      </Button>
    </form>
  );

  const painelEquipe = (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-2">
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

        <Reveal className="h-full">
          <Card className="h-full" data-testid="usuarios-transferir-card">
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
                  description="Crie mais um analista ao lado para poder transferir a carteira."
                />
              ) : (
                <TransferirCarteiraForm analistas={analistas} />
              )}
            </CardContent>
          </Card>
        </Reveal>
      </div>

      <div className="space-y-3" data-testid="usuarios-lista-equipe">
        <h3 className="font-heading text-lg font-semibold text-ink">
          Equipe Truth <span className="text-muted">({equipe.total})</span>
        </h3>
        {busca('equipe', 'Buscar por e-mail…')}

        {equipe.items.length === 0 ? (
          <EmptyState data-testid="equipe-vazia" title="Nenhuma conta de equipe encontrada." />
        ) : (
          <Card className="!p-0">
            <Table data-testid="equipe-table">
              <THead>
                <TR>
                  <TH>E-mail</TH>
                  <TH>Papel</TH>
                  <TH>Organização</TH>
                  <TH>Carteira</TH>
                  <TH>Criado em</TH>
                  <TH>
                    <span className="sr-only">Ações</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {equipe.items.map((u) => (
                  <EquipeRow
                    key={u.id}
                    id={u.id}
                    email={u.email}
                    role={u.role}
                    orgName={u.orgName}
                    carteira={u.carteira}
                    naOrgInterna={u.naOrgInterna}
                    criadoEm={formatDataHora(u.createdAt)}
                  />
                ))}
              </TBody>
            </Table>
          </Card>
        )}

        <Pagination
          page={aba === 'equipe' ? page : 1}
          pageCount={equipe.pageCount}
          hrefFor={hrefFor('equipe')}
        />
      </div>
    </div>
  );

  const painelClientes = (
    <div className="space-y-6">
      <Reveal>
        <Card data-testid="usuarios-criar-cliente-card">
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

      <div className="space-y-3" data-testid="usuarios-lista-clientes">
        <h3 className="font-heading text-lg font-semibold text-ink">
          Contas de cliente <span className="text-muted">({clientes.total})</span>
        </h3>
        {busca('clientes', 'Buscar por e-mail ou empresa…')}

        {clientes.items.length === 0 ? (
          <EmptyState
            data-testid="clientes-vazia"
            title="Nenhuma conta de cliente encontrada."
            description="Crie a empresa e o primeiro acesso no formulário acima."
          />
        ) : (
          <Card className="!p-0">
            <Table data-testid="clientes-table">
              <THead>
                <TR>
                  <TH>E-mail</TH>
                  <TH>Empresa</TH>
                  <TH>Situação</TH>
                  <TH>Plano</TH>
                  <TH>Criado em</TH>
                  <TH>
                    <span className="sr-only">Ações</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {clientes.items.map((u) => (
                  <ClienteRow
                    key={u.id}
                    id={u.id}
                    email={u.email}
                    orgId={u.orgId}
                    orgName={u.orgName}
                    orgStatus={u.orgStatus}
                    plano={u.plano}
                    criadoEm={formatDataHora(u.createdAt)}
                  />
                ))}
              </TBody>
            </Table>
          </Card>
        )}

        <Pagination
          page={aba === 'clientes' ? page : 1}
          pageCount={clientes.pageCount}
          hrefFor={hrefFor('clientes')}
        />
      </div>
    </div>
  );

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6 md:p-8" data-testid="usuarios-page">
      <PageHeader
        eyebrow="Operação Truth"
        title="Gestão de contas"
        description="Equipe interna e contas de cliente em abas separadas: criar acesso, trocar papel, corrigir lotação e redefinir senha."
      />

      <Tabs
        defaultValue={aba}
        items={[
          { id: 'equipe', label: `Equipe Truth (${equipe.total})`, content: painelEquipe },
          { id: 'clientes', label: `Clientes (${clientes.total})`, content: painelClientes },
        ]}
      />
    </main>
  );
}
