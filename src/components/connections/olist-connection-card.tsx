'use client';

import { useActionState, useState } from 'react';

import {
  disconnectOlistAction,
  saveOlistCredentialsAction,
  type OlistConnectionActionState,
} from '@/actions/olist-connections.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { formatDataHora } from '@/lib/format';
import type { OlistOAuthSurface } from '@/modules/connections/olist-oauth-attempt';
import type { ProviderConnectionSummary } from '@/modules/connections/provider-connection.repository';

const INITIAL_STATE: OlistConnectionActionState = {};

export function OlistConnectionCard(props: {
  orgId: string;
  surface: OlistOAuthSurface;
  summary: ProviderConnectionSummary | null;
  redirectUri: string;
}) {
  const configured = props.summary?.credentialsConfigured ?? false;
  const authorized = props.summary?.authorized ?? false;
  const reconnectRequired =
    props.summary?.status === 'expirado' || props.summary?.lastErrorCode === 'olist_refresh_invalido';
  const [editorMode, setEditorMode] = useState<'auto' | 'open' | 'closed'>('auto');
  const [saveState, saveAction, savePending] = useActionState(
    saveOlistCredentialsAction,
    INITIAL_STATE,
  );
  const [disconnectState, disconnectAction, disconnectPending] = useActionState(
    disconnectOlistAction,
    INITIAL_STATE,
  );

  const authorizeHref = `/api/connections/olist?orgId=${encodeURIComponent(props.orgId)}&surface=${props.surface}`;
  const editing =
    editorMode === 'open' || (editorMode === 'auto' && !configured && !saveState.ok);

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

        {props.summary?.expiresAt || props.summary?.refreshExpiresAt ? (
          <dl className="grid gap-2 text-xs text-muted sm:grid-cols-2">
            {props.summary.expiresAt ? (
              <div>
                <dt className="font-medium text-ink">Access token</dt>
                <dd>Expira em {formatDataHora(props.summary.expiresAt)}</dd>
              </div>
            ) : null}
            {props.summary.refreshExpiresAt ? (
              <div>
                <dt className="font-medium text-ink">Refresh token</dt>
                <dd>Expira em {formatDataHora(props.summary.refreshExpiresAt)}</dd>
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
        <div className="space-y-2 text-sm text-muted">
          <p>
            Crie um aplicativo na conta Olist do cliente com permissões somente leitura e cadastre esta
            URL de callback:
          </p>
          <code className="block overflow-x-auto rounded-lg bg-paper-2 px-3 py-2 text-xs text-ink">
            {props.redirectUri}
          </code>
          <p className="text-xs text-dim">
            Nesta etapa, os relatórios continuam usando Bling; o Olist ainda não importa pedidos ou
            estoque.
          </p>
        </div>

        {saveState.error ? <Alert variant="danger">{saveState.error}</Alert> : null}
        {saveState.ok ? <Alert variant="success">Credenciais salvas</Alert> : null}
        {disconnectState.error ? <Alert variant="danger">{disconnectState.error}</Alert> : null}

        {editing ? (
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
        ) : (
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
        )}
      </CardContent>
    </Card>
  );
}
