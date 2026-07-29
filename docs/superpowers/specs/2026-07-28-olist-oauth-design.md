# Olist ERP OAuth Design

**Status:** aprovado para implementação  
**Data:** 2026-07-28  
**Escopo:** credenciais, OAuth e renovação de tokens do Olist ERP (antigo Tiny), sem ingestão

## Decisão

Adicionar o Olist como uma capacidade de autorização separada do registry de ERPs operacionais. Cliente e analista responsável poderão cadastrar as credenciais do aplicativo criado na conta Olist do cliente, concluir OAuth 2.0 Authorization Code com PKCE S256 e manter os tokens renovados. O Bling continuará sendo a única fonte de pedidos, estoque, relatórios e métricas nesta entrega.

A conexão Olist permanecerá com `status='configurado'` mesmo depois da autorização. A interface derivará `authorized` da presença dos tokens cifrados. `status='ok'` continuará significando “provider operacional”, portanto um Bling `ok` poderá coexistir com um Olist `configurado` sem violar `connections_org_erp_ok_uq`.

## Objetivos

- Cada cliente cria um aplicativo na própria conta Olist e informa `client_id` e `client_secret` ao Truth Analytics.
- Usar uma única callback fixa: `${APP_URL}/api/connections/olist/callback`.
- Cliente gerencia a própria organização em `/conexoes`.
- Analista atribuído gerencia o cliente em `/analista/[orgId]`, sempre passando por `assertOrgAccess`.
- Reutilizar o mesmo card e as mesmas Server Actions nas duas superfícies.
- Cifrar credenciais e tokens em repouso, vinculando o envelope cifrado à organização, provider e finalidade do segredo.
- Ligar cada tentativa OAuth à organização, ator, superfície, versão das credenciais e sessão atual.
- Renovar tokens proativamente, sem expirar uma conexão por falha transitória ou corrida entre refreshes.
- Preservar integralmente a operação atual do Bling.

## Fatos oficiais e protocolo

- O aplicativo é criado na conta do ERP que será integrada, com o mínimo de permissões necessárias.
- Authorization endpoint: `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth`.
- Token endpoint: `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token`.
- A API usa OAuth 2.0 Authorization Code e bearer token.
- A autorização usa `scope=openid`; o token request usa `client_secret_post`.
- O discovery OIDC anuncia PKCE `S256`, que será obrigatório no Truth Analytics.
- O access token dura 4 horas e o refresh token dura 1 dia.
- A callback cadastrada no aplicativo deve ser exatamente a callback fixa exibida pelo Truth Analytics.
- Permissões recomendadas para a futura fase de ingestão: somente leitura em Pedidos, Produtos, Estoque e Dados da Empresa.

Fontes oficiais:

- https://api-docs.erp.olist.com/documentacao/comecando/criando-um-aplicativo
- https://api-docs.erp.olist.com/documentacao/comecando/autenticacao
- https://accounts.tiny.com.br/realms/tiny/.well-known/openid-configuration

## Não objetivos

- Buscar ou persistir pedidos, detalhes, produtos ou estoque do Olist.
- Implementar métricas, relatórios, webhooks ou escrita no Olist.
- Registrar Olist no `ConnectionProvider`/registry operacional.
- Alterar pipeline ou crons de ingestão.
- Tornar a conexão Olist `ok`.
- Criar o aplicativo Olist ou guardar usuário/senha do ERP.
- Migrar o OAuth existente do Bling para o novo contrato nesta etapa.

## Abordagens consideradas

### 1. Registrar Olist no `ConnectionProvider` completo

O adaptador teria de fornecer métodos de pedidos e estoque que apenas lançariam erros. Isso tornaria possível selecionar Olist acidentalmente no pipeline antes da fase de ingestão. Rejeitada por misturar autorização com capacidade operacional.

### 2. Criar registry OAuth independente — escolhida

O novo `OAuthConnectionProvider` registra apenas capacidades OAuth. O adapter Olist entra nesse registry, mas não no registry operacional. O Bling mantém o fluxo existente sem refatoração arriscada. Essa separação torna impossível o pipeline tratar uma conexão Olist como fonte de dados antes da próxima fase.

### 3. Criar tabela e fluxo exclusivos para Olist

Duplicaria os estados, a criptografia, o refresh e a auditoria já suportados pela fundação multi-ERP. Rejeitada por aumentar manutenção e dificultar a futura unificação dos providers.

## Componentes e contratos

### Adapter OAuth

Criar `src/modules/providers/oauth.types.ts`:

```ts
export type OAuthClientCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type OAuthAuthorizeInput = {
  state: string;
  codeChallenge: string;
  credentials: OAuthClientCredentials;
};

export type OAuthExchangeInput = {
  code: string;
  codeVerifier: string;
  credentials: OAuthClientCredentials;
};

export type OAuthRefreshInput = {
  refreshToken: string;
  credentials: OAuthClientCredentials;
};

export interface OAuthConnectionProvider {
  readonly name: ErpProviderId;
  buildAuthorizeUrl(input: OAuthAuthorizeInput): string;
  exchangeCode(input: OAuthExchangeInput): Promise<OAuthTokens>;
  refresh(input: OAuthRefreshInput): Promise<OAuthTokens>;
}
```

`OAuthTokens` recebe `refreshExpiresInSeconds?: number`. O adapter exige `access_token`, `refresh_token` e `expires_in` positivos. Se `refresh_expires_in` não vier, usa 86.400 segundos. Resposta inválida produz `olist_token_resposta_invalida`.

`src/modules/providers/oauth-registry.ts` registra `olistOAuthProvider`. O registry operacional existente continua retornando apenas `bling`. O OAuth Bling atual não será migrado nesta fase.

### Segredos vinculados ao tenant

Criar um wrapper sobre `encryptSecret`/`decryptSecret` que cifra um envelope:

```ts
{
  v: 1,
  orgId,
  provider: 'olist',
  kind: 'client_id' | 'client_secret' | 'access_token' | 'refresh_token',
  value
}
```

Na leitura, organização, provider e finalidade precisam coincidir. Copiar um ciphertext para outra organização ou coluna falha com `connection_secret_context_mismatch`. A chave continua vindo do keyring já suportado; não haverá uma chave física diferente por cliente.

### Repository provider-aware

Criar um repositório específico da nova abstração, sem alterar exports Bling:

```ts
configureProviderCredentials(input): Promise<void>
getProviderConnectionSummary(orgId, provider): Promise<ProviderConnectionSummary | null>
getProviderOAuthCredentials(orgId, provider): Promise<ProviderOAuthCredentials>
saveProviderTokens(input): Promise<boolean>
getValidAccessTokenForProvider(orgId, provider, margemMs?): Promise<string>
disconnectProvider(input): Promise<void>
listProviderConnectionsExpiring(input): Promise<ConnectionRef[]>
markProviderConnectionError(input): Promise<void>
```

`ProviderOAuthCredentials` é interno ao servidor e contém plaintext apenas durante a chamada, além de uma `version` SHA-256 calculada sobre os ciphertexts armazenados. `ProviderConnectionSummary` nunca contém segredos:

```ts
type ProviderConnectionSummary = {
  provider: ErpProviderId;
  status: string;
  credentialsConfigured: boolean;
  authorized: boolean;
  operational: boolean;
  expiresAt: Date | null;
  refreshExpiresAt: Date | null;
  lastRefreshAt: Date | null;
  lastSyncAt: Date | null;
  lastErrorCode: string | null;
};
```

Configurar ou substituir credenciais cifra ambos os valores, limpa tokens anteriores, grava `configurado`, limpa erros e audita `connection.olist.configurada` sem valores sensíveis. Salvar tokens usa compare-and-swap com a versão/ciphertexts das credenciais; uma callback iniciada com credenciais substituídas não consegue persistir. Desconectar limpa credenciais e tokens, grava `erro` e audita `connection.olist.desconectada`.

## Autorização por ator

Todas as entradas usam um guard compartilhado:

- cliente: `targetOrgId === access.orgId`, organização ativa e superfície `client_connections`;
- analista: `assertOrgAccess(access, targetOrgId)`, organização alvo ativa e superfície `analyst_org`;
- admin real: `assertOrgAccess` permite acesso, usando a superfície `analyst_org`;
- impersonação: sempre bloqueada por `assertNaoImpersonando`.

Página, Server Action, início OAuth e callback revalidam o acesso. Nenhum caminho confia em `orgId`, `surface` ou estado de uma página previamente renderizada. Se a carteira mudar entre o início e a callback, os tokens não são persistidos.

## State, PKCE e callback

O início gera:

- `state`: 32 bytes aleatórios em base64url;
- `codeVerifier`: 32 bytes aleatórios em base64url;
- `codeChallenge`: SHA-256 do verifier em base64url;
- `credentialsVersion`: hash dos ciphertexts lidos no início.

Um cookie `olist_oauth_attempt` contém payload assinado por HMAC-SHA-256 com `AUTH_SECRET`:

```ts
{
  state,
  codeVerifier,
  credentialsVersion,
  provider: 'olist',
  orgId,
  userId,
  returnSurface: 'client_connections' | 'analyst_org',
  issuedAt
}
```

O cookie é `HttpOnly`, `SameSite=Lax`, `Secure` em HTTPS, TTL de 10 minutos e path `/api/connections/olist/callback`. Apenas uma tentativa Olist por navegador fica ativa; iniciar outra substitui a anterior.

A callback apaga o cookie antes de chamar o token endpoint e valida assinatura, estrutura, TTL, `state` em tempo constante, provider, usuário, organização, superfície, acesso atual e versão das credenciais. O code é single-use no servidor Olist e PKCE impede sua troca sem o verifier.

O redirect URI é derivado exclusivamente de `serverEnv.APP_URL` com `/api/connections/olist/callback`; nunca usa query, `Host` ou `Referer`. A mesma função alimenta a tela de instruções, a URL de autorização e o token exchange.

Retornos são allowlisted e derivados:

- `client_connections` → `/conexoes`;
- `analyst_org` → `/analista/{orgId}?tab=conexao`;
- tentativa inválida sem cookie → `/conexoes` para cliente ou `/analista` para analista/admin.

## Concorrência de refresh

1. Ler credenciais, access token e refresh token cifrados e guardar suas versões.
2. Se o access token ainda estiver fora da margem, decifrar e retornar.
3. Chamar o adapter com plaintext somente em memória.
4. Atualizar tokens com `WHERE id = ? AND refresh_token = ? AND oauth_client_id = ? AND oauth_client_secret = ?`.
5. Se nenhuma linha mudar, reler a conexão e usar o access token do vencedor.
6. Antes de marcar erro permanente, reler; se token ou credenciais mudaram, outro processo venceu e o estado atual é preservado.
7. Falha transitória preserva tokens e `status`, registrando apenas código allowlisted e instante.
8. Falha permanente com as mesmas versões grava `expirado`, preservando as credenciais para reautorização.

Isso evita que um refresh atrasado expire ou sobrescreva o vencedor. Como Olist ainda não é data provider, somente o cron chama esse caminho nesta fase.

## Renovação proativa

Criar `/api/cron/renovar-conexoes`, protegido por `CRON_SECRET`, para conexões Olist `configurado`, autorizadas e de organizações ativas. GitHub Actions chama a rota a cada 2 horas; a seleção usa margem de 3 horas, lote máximo de 50, ordenação por expiração e processamento sequencial.

A resposta e o heartbeat `renovar-conexoes` contêm apenas `candidatas`, `renovadas`, `expiradas` e `transitorias`. Logs contêm provider, `orgId`, outcome e código allowlisted; nunca tokens, credenciais, cookie ou corpo remoto.

Falha permanente envia notificação in-app e e-mail provider-aware para o cliente e notificação ao analista responsável, tudo best-effort. Refresh bem-sucedido ou falha transitória não gera notificação nem auditoria.

## Erros seguros

- `olist_credenciais_ausentes`
- `olist_configuracao_invalida`
- `olist_state_invalido`
- `olist_acesso_revogado`
- `olist_autorizacao_negada`
- `olist_credenciais_invalidas`
- `olist_token_resposta_invalida`
- `olist_oauth_transiente`
- `olist_refresh_invalido`
- `olist_refresh_transiente`

`invalid_client`, `invalid_grant` e demais 400/401 não recuperáveis são permanentes. Rede, 429 e 5xx têm uma repetição limitada, respeitando `Retry-After` com teto de 30 segundos. O corpo remoto nunca é logado, auditado ou exibido.

## Interface compartilhada

O card “Olist ERP (antigo Tiny)” aparece nas duas superfícies e mostra:

- callback fixa copiável;
- passos para criar o aplicativo e permissões mínimas;
- client ID e client secret apenas ao configurar/substituir;
- estado “Não configurado”, “Credenciais salvas”, “Autorizado” ou “Reconexão necessária”;
- datas seguras de expiração;
- ações “Salvar credenciais”, “Autorizar no Olist”, “Refazer autorização”, “Alterar credenciais” e “Desconectar”;
- aviso explícito de que os relatórios continuam usando Bling nesta fase.

O secret usa `type=password` e `autoComplete=off`, nunca é reidratado no HTML e não aparece no summary. `/analista/[orgId]?tab=conexao` abre diretamente a aba de conexão.

## Testes e critérios de aceite

- URL de autorização contém callback fixa, `scope=openid`, state e PKCE S256.
- Token exchange/refresh usam `client_secret_post`, PKCE na troca e expirações válidas.
- Tentativa adulterada, vencida, reutilizada, de outro ator/org/provider ou com credenciais substituídas é rejeitada.
- Cliente só gerencia a própria organização.
- Analista atribuído gerencia a carteira; não atribuído falha em action, início e callback.
- Transferência da carteira entre início e callback impede persistência.
- Ciphertext copiado para outra organização/finalidade não é aceito.
- Credenciais/tokens não aparecem em summary, HTML, auditoria ou log.
- Bling `ok` coexiste com Olist `configurado` autorizado.
- Substituir credenciais limpa tokens; desconectar limpa todos os segredos.
- Refresh concorrente não sobrescreve nem expira o vencedor; transitório preserva; permanente expira.
- Registry operacional continua somente com Bling e relatórios continuam Bling.
- Cron, heartbeat, notificações, E2E cliente/analista e regressões Bling ficam verdes.

## Rollout e rollback

1. Confirmar `APP_URL`, keyring/`ENCRYPTION_KEY`, `AUTH_SECRET`, `CRON_SECRET` e callback de produção.
2. Publicar código com Olist fora do registry operacional.
3. Configurar uma organização piloto e observar pelo menos 24 horas e quatro ciclos de refresh.
4. Confirmar que o Bling `ok`, sincronizações e relatórios permanecem inalterados na organização piloto.
5. Orientar os demais clientes a criar seus aplicativos e autorizar.

Não há migração de banco nesta etapa. Em rollback, o código pode voltar sem afetar o Bling; linhas Olist `configurado` ficam ignoradas. Em incidente de credenciais, desconectar limpa segredos persistidos e o cliente deve rotacionar o client secret no Olist.

## Autorrevisão

- Escopo contém apenas credenciais, OAuth, refresh, UI e operação da conexão.
- Olist permanece fora de pedidos, estoque, relatórios e registry operacional.
- `configurado`, `authorized` e `ok` têm sentidos distintos e não conflitantes.
- Cliente e analista usam o mesmo card e têm acesso revalidado em toda entrada.
- State, PKCE, troca de credenciais, refresh concorrente e rollback têm comportamento fechado.
- Não há migração, segredo real, placeholder ou decisão pendente.
