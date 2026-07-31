# SDD ledger — plan: docs/superpowers/plans/2026-07-29-olist-data-sync.md

Tasks 1–11: complete in master through `5e78fca`.
Task 12: in progress — provider-neutral crons, scheduler, dashboard and onboarding.
Preflight: migrations 0000–0024 exist; 0025/0026 absent as expected. No Hostinger database credentials are currently discoverable. Task 13 code/CI can proceed, but its production migration gate requires the Hostinger target before Task 14/15 release ordering can be satisfied.
Task 12: review found Olist kill-switch/allowlist bypass, missing kill-switch coverage and residual provider-specific client code; fix round 1/5 in progress from `ced8330`.
Task 12: fix round 1/5 (5 addressed, 0 open; commits `ced8330..e4679e9`; scoped re-review clean). PostgreSQL/E2E value gate running in CI 30639505144.
Task 12: CI 30639505144 exposed 8 failures: rollout policy was incorrectly applied to central active-source reads/scheduler instead of only the Olist sync boundary, hiding already-active Olist data; fix round 2/5 in progress from `e4679e9`.
Task 12: fix round 2/5 (4 addressed, 1 open — blocked Olist rows can consume LIMIT before post-filter and starve Bling; commit `4a05d13`). CI regression root cause corrected; scoped re-review requires pre-limit operational filtering.
Task 12: fix round 3/5 in progress from `4a05d13` — move rollout policy into operational query before LIMIT and prove with PostgreSQL.
Task 12: fix round 3/5 (pre-limit rollout filter committed as `a21509c`; CI 30640079700 passed that regression but exposed 2 cron report fixture failures unrelated to production behavior).
Task 12: fix round 4/5 in progress from `a21509c` — make cron report connection fixtures satisfy the scheduler contract (`status='ok'` plus non-null synthetic access token); PostgreSQL GREEN pending CI because `DATABASE_URL_TEST` is absent locally.
Task 12: CI 30640774158 passed migrations/lint/typecheck/test:ci/build and 25/26 E2E; the only failure was the dashboard gating expectation retaining the old Bling-specific copy. Fix round 5/5 in progress from `25fb7cc` — align the E2E name/comments/assertion with the exact provider-neutral UI copy `Conecte seu ERP em Conexões.`; no production change.
Task 12: fix round 5/5 addressed locally — stale Bling-specific E2E expectation replaced by the exact ERP-neutral dashboard copy; focal Playwright is blocked before execution only by absent `DATABASE_URL_TEST`, so CI remains the real E2E gate.
Task 12: complete — CI 30641591710 passou migrations PostgreSQL, audit, lint, typecheck, test:ci, build e Playwright no commit `9e5b67c`.
Task 13: implementação aditiva concluída localmente — schema, migration 0025, snapshot/journal gerados pelo Drizzle e teste PostgreSQL isolado adicionados; typecheck e diff-check verdes. O gate PostgreSQL focal permanece pendente de CI porque `DATABASE_URL_TEST` não existe localmente. Task 14 não iniciada.
Task 13: fix round 1 — teste PostgreSQL passa a proteger `integer`/`bigint`, `NOT NULL` e defaults `1`/`0` via `information_schema.columns`; nenhuma produção alterada, gate PostgreSQL ainda pendente de CI sem `DATABASE_URL_TEST` local.
Task 13: CI 30643154939 passou 266 arquivos/1717 testes e expôs uma única falha no fixture isolado: `product_stock` referencia `public.organizations`, mas a organização havia sido inserida no schema descartável. Fix round 2 cria/remove a organização em `public` e não altera produção.
Task 13: CI 30643639955 passou 266 arquivos/1717 testes e expôs uma única falha no drop da identidade legada: `org_sku` é constraint da 0012, mas `org_provider_sku` é unique index da 0020. Fix round 3 usa `ALTER TABLE ... DROP CONSTRAINT` e `DROP INDEX` qualificados pelo schema descartável; produção inalterada.
