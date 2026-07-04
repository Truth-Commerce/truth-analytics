# Runbook — Rotação de segredos (Truth Analytics)

> Contexto: auditoria 2026-07-03 (achado C4): `.env.local` com credenciais vivas,
> mesma senha Neon em prod e test, `ANTHROPIC_API_KEY` ativa.
> **ORDEM OBRIGATÓRIA: a cripto versionada (F0 Tasks 9–10) precisa estar EM PRODUÇÃO
> (deploy verificado) e o `npm run db:reencrypt` precisa concluir com `falhas: 0`
> ANTES de aposentar/rotacionar a `ENCRYPTION_KEY` legada — senão os tokens Bling
> em repouso que ainda estiverem no formato legado viram `decrypt_failed`.**

## Como a cripto versionada funciona (leia antes de mexer)

Confirmado no código (`src/modules/crypto/crypto.ts`, `src/lib/env.ts`):

- **Payload legado** (`iv.tag.ct`, sem prefixo): é decifrado com a env **`ENCRYPTION_KEY`**
  (chave legada avulsa) — **nunca** pelo chaveiro. Enquanto existir 1 token legado em
  repouso, a `ENCRYPTION_KEY` legada tem que continuar setada.
- **Payload v1** (`v1:<keyId>:<iv>:<tag>:<ct>`): a chave é resolvida pelo `<keyId>`
  dentro de **`ENCRYPTION_KEYS`** (JSON `{ "<keyId>": "<base64 32 bytes>" }`).
- A env `ENCRYPTION_KEY_ACTIVE` define qual keyId do chaveiro cifra os payloads novos.
- **`ENCRYPTION_KEYS` e `ENCRYPTION_KEY_ACTIVE` andam SEMPRE JUNTAS.** A validação de env
  (`src/lib/env.ts`, `superRefine`) **recusa o boot** se só uma das duas estiver setada, ou
  se o `ACTIVE` não existir dentro do chaveiro. Isso vale tanto na Vercel (app não sobe)
  quanto localmente (`npm run db:reencrypt` estoura no `parseServerEnv`). Sempre adicione/remova
  as duas no mesmo passo, antes do redeploy.
- **keyId** casa `^[a-z0-9_-]{1,16}$` e não pode ser `__proto__`, `constructor` nem `prototype`.
  Use nomes simples: `k1`, `k2`, …

> ⚠️ **A chave ativa do chaveiro (`k1`) NÃO é o valor atual da `ENCRYPTION_KEY`.**
> Trocar o segredo exige uma chave **nova**: a legada foi exposta no `.env.local` (é o
> motivo da rotação). O chaveiro é para os payloads novos/re-encriptados; a `ENCRYPTION_KEY`
> legada só sobrevive até o `db:reencrypt` migrar o que restou.

## 0. Pré-checagens

- [ ] Deploy atual de produção contém as Tasks 9–10 da F0 (checar no painel Vercel que o
      commit da F0 está em **Production**).
- [ ] Acesso: Vercel CLI logada (`vercel whoami`), console Neon, console Anthropic, Resend,
      SerpAPI, portal de dev do Bling.
- [ ] `.env.local` **aponta o `POSTGRES_URL` para a URL DIRECT (não-pooled)** do branch `main`
      de produção. Os scripts locais (`db:reencrypt`, verificações) usam `serverEnv.POSTGRES_URL`;
      o endpoint **pooled dá timeout** a partir deste ambiente (fato conhecido do repo). Guarde a
      URL pooled para a Vercel; use a direct localmente.
- [ ] Janela de baixa atividade (a troca de `AUTH_SECRET` derruba todas as sessões ativas).
- [ ] Backup mental da lista atual de envs: `vercel env ls production`.

## 1. `ENCRYPTION_KEY` → chaveiro versionado (PRIMEIRO — migração inicial legado → v1)

1. Gerar a chave nova (32 bytes base64). No Windows/pwsh prefira o `node` (sempre presente):
   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```
   (alternativa, se tiver openssl: `openssl rand -base64 32`)
2. Montar o chaveiro com essa chave **nova** como `k1` e definir o keyId ativo:
   ```
   ENCRYPTION_KEYS={"k1":"<chave nova gerada no passo 1>"}
   ENCRYPTION_KEY_ACTIVE=k1
   ```
   **Manter a `ENCRYPTION_KEY` legada como está** — ela decifra os payloads legados até a
   re-encriptação terminar. (Não coloque o valor legado dentro do chaveiro: o legado é decifrado
   pela env `ENCRYPTION_KEY`, não pelo `k1`.)
3. Subir as **duas** envs juntas na Vercel (production):
   ```bash
   vercel env add ENCRYPTION_KEYS production
   vercel env add ENCRYPTION_KEY_ACTIVE production
   ```
   (manter `ENCRYPTION_KEY` por enquanto — a leitura do legado depende dela)
4. Atualizar o `.env.local` com as **mesmas duas** envs novas (mantendo a `ENCRYPTION_KEY` legada).
5. Redeploy: `vercel redeploy` (ou `git push` para disparar deploy) e **smoke**:
   login + página **Conexões** mostra o Bling conectado (getValidAccessToken decifra o legado).
6. Re-encriptar os tokens em repouso para o formato v1 (roda contra o banco de PRODUÇÃO do
   `.env.local`, que deve estar na URL **direct**):
   ```bash
   npm run db:reencrypt
   ```
   **Saída esperada** (JSON de conclusão) e **exit code 0**:
   ```
   {"msg":"reencrypt concluído","total":N,"atualizadas":N,"falhas":0}
   ```
   O script **imprime os ids das linhas puladas/ignoradas** e **sai com código 1 se `falhas > 0`**,
   avisando: *"NÃO remova a ENCRYPTION_KEY legada enquanto houver falhas"*.
7. **GATE (obrigatório):** só siga se `falhas == 0` **e** o comando saiu com **exit 0**
   (confira no pwsh: `$LASTEXITCODE` deve ser `0`). Se `falhas > 0`, **PARE**: investigue os ids
   logados (chave desconhecida/payload corrompido) e resolva antes de continuar — **não** aposente
   a `ENCRYPTION_KEY`.
8. Verificar que não restou payload legado (deve retornar 0):
   ```bash
   node -e "const p=require('postgres');const fs=require('fs');const u=fs.readFileSync('.env.local','utf8').match(/^POSTGRES_URL=(.*)$/m)[1];const sql=p(u,{prepare:false});(async()=>{try{const r=await sql\`select count(*)::int n from connections where access_token is not null and access_token not like 'v1:%'\`;console.log('legados:',r[0].n);}finally{await sql.end();}})()"
   ```
9. **Smoke final:** gerar 1 relatório real (usa `getValidAccessToken` → `decryptSecret` de payload v1).
10. **Só agora** aposentar a env legada (gate do passo 7 satisfeito):
    ```bash
    vercel env rm ENCRYPTION_KEY production
    ```
    e apagar `ENCRYPTION_KEY` do `.env.local`. Redeploy + smoke (login + Conexões) para confirmar
    que nada dependia mais do legado.

> **Rotações FUTURAS da chave do chaveiro** (quando `k1` precisar ser trocada) seguem o padrão
> add/reencrypt/remove: gere `k2` (novo valor), adicione ao JSON `ENCRYPTION_KEYS`
> (`{"k1":"…","k2":"…"}`), aponte `ENCRYPTION_KEY_ACTIVE=k2`, redeploy, `npm run db:reencrypt`
> até `falhas: 0`, mantenha `k1` no JSON por ~30 dias (rollback) e só então remova `k1` do JSON.

## 2. Senhas Neon — separadas por ambiente (prod ≠ test)

1. Console Neon → branch `main` → **Roles → Reset password**. Copiar a connection string nova
   (**pooled** e **direct**).
2. Atualizar na Vercel (production usa a **pooled**):
   ```bash
   vercel env rm POSTGRES_URL production && vercel env add POSTGRES_URL production
   vercel env rm POSTGRES_URL_DIRECT production && vercel env add POSTGRES_URL_DIRECT production
   ```
   No `.env.local`, deixe `POSTGRES_URL` na URL **direct** (footgun dos scripts locais, §0).
3. Console Neon → branch `test` → **Roles → Reset password** com **senha DIFERENTE da `main`**.
   Atualizar `DATABASE_URL_TEST` e `DATABASE_URL_TEST_DIRECT` no `.env.local`
   (essas envs de teste **não** vão para a Vercel de produção).
4. Redeploy + smoke (login) + `npm run test` local (valida o branch `test` com a senha nova).

## 3. `ANTHROPIC_API_KEY`

1. Console Anthropic → criar API key nova.
2. Trocar na Vercel + `.env.local`:
   ```bash
   vercel env rm ANTHROPIC_API_KEY production && vercel env add ANTHROPIC_API_KEY production
   ```
3. Redeploy + gerar 1 relatório de **smoke** (pipeline chama a Claude).
4. Revogar a key antiga no console Anthropic (SÓ depois do smoke passar).

## 4. `AUTH_SECRET`

1. Gerar: `openssl rand -base64 32` (ou o `node -e` do §1.1).
2. Trocar na Vercel + `.env.local`:
   ```bash
   vercel env rm AUTH_SECRET production && vercel env add AUTH_SECRET production
   ```
3. Redeploy. **Efeito: TODAS as sessões caem (relogin obrigatório)** — combine o horário com os
   admins. Smoke: login com credenciais válidas funciona.

## 5. Demais chaves (mesmo padrão rm/add + redeploy + smoke)

Todas opcionais no schema; troque só as que existirem.

- `RESEND_API_KEY` (console Resend; smoke = e-mail de "relatório pronto" chega).
- `SERPAPI_KEY` (painel SerpAPI; smoke = relatório com benchmark de mercado completo).
- `BLING_CLIENT_SECRET` (portal de dev Bling — **regenerar o secret do app**; smoke = reconectar
  OAuth de um cliente de teste). ⚠️ **NÃO invalide o app em si, só o secret.** Reconexões OAuth
  existentes seguem válidas; novos fluxos de authorize passam a usar o secret novo.

## 6. Envs a conferir/criar ao mexer na Vercel (F0)

- `APP_URL`: **tem que ser a URL de produção** (ex.: `https://truth-analytics.vercel.app`),
  **nunca `http://localhost:3000`**. O schema tem esse default de localhost — footgun real:
  se ficar no default em produção, links de e-mail e callbacks apontam para localhost.
- `PIPELINE_SECRET` (mín. 16 chars): `openssl rand -hex 32` → `vercel env add PIPELINE_SECRET production` + `.env.local`.
  Autentica o POST interno em `/api/pipeline/run`.
- `CRON_SECRET` (mín. 16 chars): `openssl rand -hex 32` → `vercel env add CRON_SECRET production` + `.env.local`.
  A Vercel envia como `Authorization: Bearer ${CRON_SECRET}` nos crons de `vercel.json`.
- `SENTRY_DSN` (opcional): projeto Sentry — sem ela o logger opera em no-op.
- `DB_POOL_MAX` (opcional, 1–20): override do tamanho do pool. Deixe ausente em produção
  (default 1 na Vercel); os scripts locais podem subir esse valor.

## 7. Encerramento

- [ ] `vercel env ls production` confere com a lista esperada (**sem `ENCRYPTION_KEY` legada**;
      `ENCRYPTION_KEYS` + `ENCRYPTION_KEY_ACTIVE` presentes; `APP_URL` na URL de produção).
- [ ] Smoke completo: login, Conexões (Bling conectado), gerar relatório, e-mail recebido.
- [ ] `.env.local` limpo dos valores aposentados.
- [ ] Registrar a data desta rotação e a próxima (sugestão: 6 meses) na tabela abaixo.

| Data | O que foi rotacionado | Por quem |
|---|---|---|
| _preencher_ | | |
