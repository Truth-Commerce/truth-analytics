'use client';

import { useActionState, useState } from 'react';

import {
  disconnectOlistAction,
  saveOlistCredentialsAction,
  type OlistConnectionActionState,
} from '@/actions/olist-connections.actions';
import {
  activateOlistAction,
  rollbackToBlingAction,
  type ErpActivationActionState,
} from '@/actions/erp-activation.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { formatDataHora } from '@/lib/format';
import type { OlistOAuthSurface } from '@/modules/connections/olist-oauth-attempt';
import type { ErpConnectionReadModel } from '@/modules/connections/provider-connection.repository';

const INITIAL_STATE: OlistConnectionActionState = {};
const INITIAL_ACTIVATION_STATE: ErpActivationActionState = {};

const PREPARATION_LABELS = {
  not_started: 'Aguardando preparação',
  snapshot: 'Importando histórico',
  catchup: 'Atualizando pedidos recentes',
  verify1: 'Validando dados',
  verify2: 'Confirmando consistência',
  details: 'Preparando detalhes dos pedidos',
  ready: 'Pronto para ativação',
  blocked: 'Preparação requer atenção',
} as const;

export function OlistConnectionCard(props: {
  orgId: string;
  surface: OlistOAuthSurface;
  readModel: ErpConnectionReadModel;
  canManageErp: boolean;
  redirectUri: string;
}) {
  const summary = props.readModel.olist;
  const configured = summary?.credentialsConfigured ?? false;
  const authorized = summary?.authorized ?? false;
  const reconnectRequired =
    summary?.status === 'expirado' || summary?.lastErrorCode === 'olist_refresh_invalido';
  const [editorMode, setEditorMode] = useState<'auto' | 'open' | 'closed'>('auto');
  const [saveState, saveAction, savePending] = useActionState(
    saveOlistCredentialsAction,
    INITIAL_STATE,
  );
  const [disconnectState, disconnectAction, disconnectPending] = useActionState(
    disconnectOlistAction,
    INITIAL_STATE,
  );
  const [activateState, activateAction, activatePending] = useActionState(
    activateOlistAction,
    INITIAL_ACTIVATION_STATE,
  );
  const [rollbackState, rollbackAction, rollbackPending] = useActionState(
    rollbackToBlingAction,
    INITIAL_ACTIVATION_STATE,
  );

  const authorizeHref = `/api/connections/olist?orgId=${encodeURIComponent(props.orgId)}&surface=${props.surface}`;
  const editing =
    editorMode === 'open' || (editorMode === 'auto' && !configured && !saveState.ok);
  const canActivate = Boolean(
    props.canManageErp &&
      authorized &&
      props.readModel.preparation?.ready &&
      props.readModel.activeProvider !== 'olist',
  );
  const canRollback = Boolean(
    props.canManageErp &&
      props.readModel.activeProvider === 'olist' &&
      props.readModel.bling?.authorized,
  );
  const activeProviderLabel =
    props.readModel.activeProvider === 'olist'
      ? 'Olist ERP'
      : props.readModel.activeProvider === 'bling'
        ? 'Bling'
        : 'Nenhum';
  const activeLastSync =
    props.readModel.activeProvider === 'olist'
      ? summary?.lastSyncAt
      : props.readModel.activeProvider === 'bling'
        ? props.readModel.bling?.lastSuccessfulSyncAt
        : null;
  const preparation = props.readModel.preparation;

  return (
    <Card data-testid="olist-connection-card" lift={false}>
      <CardHeader>
        <div>
          <CardTitle as="h2" className="text-base">
            Olist ERP (antigo Tiny)
          </CardTitle>
          <p className="mt-1 text-xs text-muted" data-testid="olist-connection-status">
            {reconnectRequired
              ? 'Reconexão necessária'
              : authorized
                ? 'Autorizado'
                : configured
                  ? 'Credenciais salvas'
                  : 'Não configurado'}
          </p>
        </div>

        {summary?.expiresAt || summary?.refreshExpiresAt ? (
          <dl className="grid gap-2 text-xs text-muted sm:grid-cols-2">
            {summary.expiresAt ? (
              <div>
                <dt className="font-medium text-ink">Access token</dt>
                <dd>Expira em {formatDataHora(summary.expiresAt)}</dd>
              </div>
            ) : null}
            {summary.refreshExpiresAt ? (
              <div>
                <dt className="font-medium text-ink">Refresh token</dt>
                <dd>Expira em {formatDataHora(summary.refreshExpiresAt)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {reconnectRequired ? (
          <Alert variant="warning" title="Reconexão necessária">
            A autorização expirou. Reconecte o Olist para manter a integração disponível.
          </Alert>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <section className="grid gap-3 rounded-xl border border-line bg-paper-2 p-4 sm:grid-cols-2" aria-label="Estado da integração">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-dim">ERP ativo</p>
            <p className="mt-1 text-sm font-semibold text-ink">{activeProviderLabel}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-dim">Última sincronização</p>
            <p className="mt-1 text-sm text-ink">
              {activeLastSync ? formatDataHora(activeLastSync) : 'Ainda não realizada'}
            </p>
          </div>
        </section>

        {preparation ? (
          <section className="space-y-2 rounded-xl border border-line p-4" aria-label="Preparação do Olist">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{PREPARATION_LABELS[preparation.stage]}</p>
              <span className="text-xs text-muted">
                {preparation.persistedCount} de {preparation.expectedCount} pedidos preparados
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Pedidos preparados"
              aria-valuemin={0}
              aria-valuemax={Math.max(preparation.expectedCount, 1)}
              aria-valuenow={Math.min(preparation.persistedCount, Math.max(preparation.expectedCount, 1))}
              className="h-2 overflow-hidden rounded-full bg-line"
            >
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-500"
                style={{
                  width: `${preparation.expectedCount > 0
                    ? Math.min(100, (preparation.persistedCount / preparation.expectedCount) * 100)
                    : 0}%`,
                }}
              />
            </div>
            {preparation.pendingDetails > 0 || preparation.quarantinedDetails > 0 ? (
              <p className="text-xs text-muted">
                {preparation.pendingDetails} detalhes pendentes
                {preparation.quarantinedDetails > 0
                  ? ` · ${preparation.quarantinedDetails} em revisão`
                  : ''}
              </p>
            ) : null}
          </section>
        ) : null}

        <div className="space-y-2 text-sm text-muted">
          <p>
            Crie um aplicativo na conta Olist do cliente com permissões somente leitura e cadastre esta
            URL de callback:
          </p>
          <code className="block overflow-x-auto rounded-lg bg-paper-2 px-3 py-2 text-xs text-ink">
            {props.redirectUri}
          </code>
          <p className="text-xs text-dim">
            Quando este ERP estiver conectado e ativo, pedidos e relatórios usarão os dados do Olist.
          </p>
        </div>

        {saveState.error ? <Alert variant="danger">{saveState.error}</Alert> : null}
        {saveState.ok ? <Alert variant="success">Credenciais salvas</Alert> : null}
        {disconnectState.error ? <Alert variant="danger">{disconnectState.error}</Alert> : null}
        {activateState.error ? <Alert variant="danger">{activateState.error}</Alert> : null}
        {activateState.ok ? <Alert variant="success">Olist ativado com sucesso.</Alert> : null}
        {rollbackState.error ? <Alert variant="danger">{rollbackState.error}</Alert> : null}
        {rollbackState.ok ? <Alert variant="success">Bling restaurado com sucesso.</Alert> : null}

        {canActivate ? (
          <form action={activateAction} className="rounded-xl border border-brand/30 bg-brand/5 p-4">
            <input type="hidden" name="orgId" value={props.orgId} />
            <p className="mb-3 text-sm text-muted">
              A preparação foi concluída. A troca passa a usar os dados do Olist nas próximas leituras.
            </p>
            <Button type="submit" size="sm" disabled={activatePending} data-testid="activate-olist">
              {activatePending ? 'Ativando…' : 'Ativar Olist'}
            </Button>
          </form>
        ) : null}

        {canRollback ? (
          <form action={rollbackAction} className="rounded-xl border border-line bg-paper-2 p-4">
            <input type="hidden" name="orgId" value={props.orgId} />
            <p className="mb-3 text-sm text-muted">
              Use o Bling novamente como fonte ativa sem remover os dados preparados no Olist.
            </p>
            <Button type="submit" variant="secondary" size="sm" disabled={rollbackPending} data-testid="rollback-bling">
              {rollbackPending ? 'Restaurando…' : 'Voltar para Bling'}
            </Button>
          </form>
        ) : null}

        {editing && props.readModel.activeProvider !== 'olist' ? (
          <form action={saveAction} className="grid gap-3 md:grid-cols-2" data-testid="olist-credentials-form">
            <input type="hidden" name="orgId" value={props.orgId} />
            <input type="hidden" name="surface" value={props.surface} />
            <label className="space-y-1 text-sm text-ink">
              <span>Client ID</span>
              <Input name="clientId" required maxLength={255} autoComplete="off" />
            </label>
            <label className="space-y-1 text-sm text-ink">
              <span>Client Secret</span>
              <Input
                name="clientSecret"
                type="password"
                required
                maxLength={1024}
                autoComplete="off"
              />
            </label>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" size="sm" disabled={savePending}>
                {savePending ? 'Salvando…' : 'Salvar credenciais'}
              </Button>
              {configured ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditorMode('closed')}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
        ) : props.readModel.activeProvider !== 'olist' ? (
          <div className="flex flex-wrap gap-2">
            <Button as="a" href={authorizeHref} size="sm">
              {reconnectRequired
                ? 'Reconectar Olist'
                : authorized
                  ? 'Refazer autorização'
                  : 'Autorizar no Olist'}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditorMode('open')}>
              Alterar credenciais
            </Button>
            <form action={disconnectAction}>
              <input type="hidden" name="orgId" value={props.orgId} />
              <input type="hidden" name="surface" value={props.surface} />
              <Button type="submit" variant="danger" size="sm" disabled={disconnectPending}>
                {disconnectPending ? 'Desconectando…' : 'Desconectar'}
              </Button>
            </form>
          </div>
        ) : (
          <p className="text-xs text-dim">
            Para alterar credenciais ou desconectar, volte primeiro para o Bling.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
