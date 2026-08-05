# Analyst Client Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o analista operar sempre sobre uma organização cliente explícita e permitir a geração segura de relatórios Bling ou Olist pela ficha da carteira.

**Architecture:** O menu do analista deixa de apontar para rotas client-scoped. Uma server action dedicada recebe o alvo, revalida sessão e carteira, verifica o ERP ativo e delega a fila ao `enqueueReport`. Um componente client isolado apresenta o disparo e seu resultado dentro de `/analista/[orgId]`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle/PostgreSQL, Vitest, React `useFormState`.

## Global Constraints

- Nunca usar `access.orgId` de analista como organização cliente.
- Autorizar cada alvo com `requireAnalista` e `assertOrgAccess` antes de enfileirar.
- Aceitar o ERP ativo canônico, seja `bling` ou `olist`.
- Reutilizar `enqueueReport`; não duplicar criação, período ou dispatch.
- Registrar auditoria somente após o enfileiramento bem-sucedido.
- Não criar seletor global nem adaptar rotas `/dashboard/*` para staff.

---

### Task 1: Navegação do analista sem contexto implícito

**Files:**
- Modify: `tests/unit/nav-model.test.ts`
- Modify: `src/components/nav-model.ts`

**Interfaces:**
- Consumes: `navItems(variant: 'client' | 'admin' | 'analista'): NavItem[]`
- Produces: menu do analista limitado a `/analista`, `/analista/comparativo` e `/analista/conexoes`.

- [ ] **Step 1: Alterar primeiro o teste do menu**

```ts
it('analista usa somente rotas com contexto explícito de cliente', () => {
  expect(navItems('analista').map((item) => item.href)).toEqual([
    '/analista',
    '/analista/comparativo',
    '/analista/conexoes',
  ]);
  expect(navItems('analista').some((item) => item.href.startsWith('/dashboard'))).toBe(false);
});
```

- [ ] **Step 2: Executar o teste e confirmar a regressão**

Run: `npm test -- --run tests/unit/nav-model.test.ts`

Expected: FAIL porque o menu ainda contém `/dashboard`, Estoque, Kits, Calendário e Plano de Ação client-scoped.

- [ ] **Step 3: Reduzir o menu ao contexto seguro**

```ts
if (variant === 'analista') {
  return [
    { href: '/analista', label: 'Carteira', icon: 'portfolio', description: 'Clientes sob acompanhamento' },
    { href: '/analista/comparativo', label: 'Comparativo', icon: 'compare', description: 'Compare contas e períodos' },
    { href: '/analista/conexoes', label: 'Conexões', icon: 'connections', description: 'Configure o ERP dos clientes' },
  ];
}
```

- [ ] **Step 4: Executar o teste e confirmar aprovação**

Run: `npm test -- --run tests/unit/nav-model.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/nav-model.ts tests/unit/nav-model.test.ts
git commit -m "fix: manter analista no contexto da carteira"
```

### Task 2: Action autorizada de geração por staff

**Files:**
- Modify: `tests/unit/staff-actions.test.ts`
- Modify: `src/actions/staff.actions.ts`

**Interfaces:**
- Consumes: `assertOrgAccess(access, orgId)`, `getActiveErpConnection(orgId)`, `enqueueReport(orgId)` e `recordAudit(input)`.
- Produces: `staffGenerateReportAction(_prev: StaffReportState, formData: FormData): Promise<StaffReportState>` onde `StaffReportState = { error?: string; ok?: boolean; reportId?: string }`.

- [ ] **Step 1: Adicionar mocks e testes da action**

```ts
it('analista atribuído gera relatório com Olist ativo', async () => {
  vi.mocked(getActiveErpConnection).mockResolvedValue({
    orgId: 'org-a', provider: 'olist', sourceGeneration: 2,
    accountFingerprint: 'a'.repeat(64), lastSyncAt: new Date(),
  });
  vi.mocked(enqueueReport).mockResolvedValue({ ok: true, reportId: 'report-1' });
  const result = await staffGenerateReportAction({}, form({ orgId: 'org-a' }));
  expect(result).toEqual({ ok: true, reportId: 'report-1' });
  expect(assertOrgAccess).toHaveBeenCalledWith(expect.objectContaining({ role: 'analista' }), 'org-a');
});

it('recusa analista fora da carteira antes da fila', async () => {
  vi.mocked(assertOrgAccess).mockRejectedValueOnce(new Error('acesso_negado'));
  expect(await staffGenerateReportAction({}, form({ orgId: 'org-b' }))).toEqual({ error: 'Acesso negado.' });
  expect(enqueueReport).not.toHaveBeenCalled();
});

it('recusa organização sem ERP ativo', async () => {
  vi.mocked(getActiveErpConnection).mockResolvedValue(null);
  expect(await staffGenerateReportAction({}, form({ orgId: 'org-a' }))).toEqual({ error: 'Nenhum ERP ativo para este cliente.' });
});
```

- [ ] **Step 2: Executar e observar falha pela action inexistente**

Run: `npm test -- --run tests/unit/staff-actions.test.ts`

Expected: FAIL porque `staffGenerateReportAction` ainda não existe.

- [ ] **Step 3: Implementar a action mínima**

```ts
export type StaffReportState = { error?: string; ok?: boolean; reportId?: string };

export async function staffGenerateReportAction(
  _prev: StaffReportState,
  formData: FormData,
): Promise<StaffReportState> {
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };
  const access = await autorizarStaff(orgId);
  if (!access) return { error: 'Acesso negado.' };
  if (!await getActiveErpConnection(orgId)) return { error: 'Nenhum ERP ativo para este cliente.' };

  const result = await enqueueReport(orgId);
  if (!result.ok) {
    if (result.motivo === 'relatorio_em_andamento') return { error: 'Já existe um relatório em andamento para este cliente.', reportId: result.reportId };
    if (result.motivo === 'sem_plano') return { error: 'Organização sem plano definido.' };
    return { error: 'Não foi possível iniciar o relatório.', reportId: result.reportId };
  }

  await recordAudit({ orgId, userId: access.id, acao: 'report.disparado_staff', detalhes: { reportId: result.reportId } });
  revalidatePath(`/analista/${orgId}`);
  return { ok: true, reportId: result.reportId };
}
```

- [ ] **Step 4: Executar os testes da action**

Run: `npm test -- --run tests/unit/staff-actions.test.ts`

Expected: PASS para analista atribuído, admin, Olist, Bling, falta de ERP e bloqueio de carteira.

- [ ] **Step 5: Commit**

```bash
git add src/actions/staff.actions.ts tests/unit/staff-actions.test.ts
git commit -m "feat: permitir relatório por staff autorizado"
```

### Task 3: Card de geração na ficha do cliente

**Files:**
- Create: `src/app/analista/[orgId]/staff-generate-report.tsx`
- Create: `tests/unit/staff-generate-report.test.tsx`
- Modify: `src/app/analista/[orgId]/page.tsx`

**Interfaces:**
- Consumes: `staffGenerateReportAction`, `orgId`, `source.provider`, `latest`.
- Produces: `StaffGenerateReport({ orgId, provider, reportInProgressId })`.

- [ ] **Step 1: Escrever o teste do componente**

```tsx
it('mostra o ERP ativo e envia a organização explícita', () => {
  const html = renderToStaticMarkup(
    <StaffGenerateReport orgId="org-a" provider="olist" reportInProgressId={null} />,
  );
  expect(html).toContain('Olist ERP ativo');
  expect(html).toContain('name="orgId"');
  expect(html).toContain('value="org-a"');
  expect(html).toContain('Gerar relatório agora');
});
```

- [ ] **Step 2: Executar o teste e confirmar falha pela ausência do componente**

Run: `npm test -- --run tests/unit/staff-generate-report.test.tsx`

Expected: FAIL porque o módulo ainda não existe.

- [ ] **Step 3: Implementar o componente client**

```tsx
'use client';

export function StaffGenerateReport({ orgId, provider, reportInProgressId }: Props) {
  const [state, action] = useFormState(staffGenerateReportAction, {});
  return (
    <Card>
      <CardHeader><CardTitle as="h2">Gerar relatório</CardTitle></CardHeader>
      <CardContent>
        <p>{provider === 'olist' ? 'Olist ERP ativo' : 'Bling ativo'}</p>
        <form action={action}>
          <input type="hidden" name="orgId" value={orgId} />
          <Submit disabled={Boolean(reportInProgressId)} />
        </form>
        {state.ok ? <Alert variant="success">Relatório iniciado.</Alert> : null}
        {state.error ? <Alert variant="danger">{state.error}</Alert> : null}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Inserir o card na ficha após os dados do dashboard**

```tsx
<StaffGenerateReport
  orgId={orgId}
  provider={dashboardData.source?.provider ?? null}
  reportInProgressId={
    dashboardData.latest && ['queued', 'running'].includes(dashboardData.latest.status)
      ? dashboardData.latest.id
      : null
  }
/>
```

- [ ] **Step 5: Executar testes, tipos e lint**

Run: `npm test -- --run tests/unit/nav-model.test.ts tests/unit/staff-actions.test.ts tests/unit/staff-generate-report.test.tsx`

Expected: todos PASS.

Run: `npm run typecheck && npm run lint`

Expected: TypeScript sem erros e ESLint sem novos erros.

- [ ] **Step 6: Commit**

```bash
git add src/app/analista/[orgId]/staff-generate-report.tsx src/app/analista/[orgId]/page.tsx tests/unit/staff-generate-report.test.tsx
git commit -m "feat: gerar relatório na ficha do cliente"
```

### Task 4: Publicação e verificação em produção

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: branch verificada e serviço EasyPanel `automatruth_truth-analytics`.
- Produces: master mesclada, build implantado e fluxo validado em `analytics.truthcommerce.com.br`.

- [ ] **Step 1: Rodar verificação final local**

Run: `npm run typecheck && npm test -- --run tests/unit/nav-model.test.ts tests/unit/staff-actions.test.ts tests/unit/staff-generate-report.test.tsx`

Expected: exit code 0.

- [ ] **Step 2: Publicar branch e abrir PR**

```bash
git push -u origin fix/analyst-dashboard-org-context
gh pr create --base master --head fix/analyst-dashboard-org-context --title "feat: operar relatórios no contexto do cliente" --body-file <arquivo-de-descricao>
```

- [ ] **Step 3: Mesclar e disparar o EasyPanel**

Mesclar o PR após os checks e chamar o deploy token do serviço sem imprimir o segredo.

- [ ] **Step 4: Verificar produção**

```text
GET https://analytics.truthcommerce.com.br/sign-in → 200
connections.status da organização J & D → ok
connections.provider → olist
ficha /analista/[orgId] → Olist ERP ativo + Gerar relatório agora
```

- [ ] **Step 5: Gerar o primeiro relatório**

Usar o botão da ficha. Confirmar no banco que existe um relatório `queued`, `running` ou `done` com `source_provider='olist'` e a geração ativa da conexão.
