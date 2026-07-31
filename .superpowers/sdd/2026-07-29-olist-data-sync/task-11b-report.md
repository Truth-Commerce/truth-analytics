# Task 11B — atomic ERP activation repository report

## Scope

- Replaced the compressed activation repository with typed helpers for authorization,
  deterministic connection locking, readiness/lease validation, explicit rollback,
  switching, safe results, and PostgreSQL conflict mapping.
- Updated the PostgreSQL activation coverage to initialize rollout settings before
  each test, seed context-bound encrypted token envelopes, keep automatic scenarios
  independent, and cover expired/live leases, state fingerprint mismatch, token
  envelope mismatch, rollback preconditions, exact audit facts, and secret scans.

## Commits and CI

- RED test-only commit: `6bac7c9` (`test(olist): cobrir ativação ERP atômica`).
- RED CI: `30579439368` (expected failures before the repository existed).
- Replaced GREEN commit: `5993b1c` was rejected by CI `30580802350` because
  the automatic-only fixture incorrectly changed explicit `null` to Bling.
- Previous rejected GREEN: `76fbbd3`; CI `30579947799`.
- Rewritten implementation commit: `ae4bc33` (`feat(olist): ativar ERP com transação atômica`).
- Hardening/final GREEN commit: `72cbddc` (`fix(olist): mapear conflito PostgreSQL e endurecer testes de ativacao`).
- Failed pre-hardening CI: `30620561268` — 1,683 tests passed and the only failure
  proved that PostgreSQL serialization errors arrived wrapped by the driver instead
  of being published as the stable `erp_ativo_alterado` domain error.
- Final GREEN CI: `30621419570` — dependency audit, test migrations, lint,
  typecheck, 1,684 PostgreSQL/unit tests, production build and Playwright E2E all passed.

## Local evidence

- `npm run typecheck` — passed.
- `npm run lint` — exit 0; repository-wide pre-existing warnings remain.
- `npm test -- tests/integration/erp-activation.test.ts` — Vitest collected the
  suite, but skipped it locally because `DATABASE_URL_TEST` is not configured.

## Caveats

- The workflow still reports pre-existing non-blocking lint warnings and GitHub's
  Node 20 action deprecation notice; neither originates in Task 11B.
- Task 11B intentionally stops before actions/UI/orchestration and does not merge the PR.
