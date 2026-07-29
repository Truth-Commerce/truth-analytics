# Task 3 RED evidence

Executed before the corresponding GREEN implementation:

- `fingerprintOlistAccount normaliza o documento antes do HMAC SHA-256 dedicado`: failed with explicit `not_implemented`, while expecting a 64-character hex HMAC.
- `fingerprintOlistAccount falha fechada sem chave dedicada`: failed with explicit `not_implemented`, while expecting `olist_account_fingerprint_key_invalid`.

Command: `npm test -- tests/unit/olist-account.test.ts` (2026-07-29). The failure was behavioral, not import/fixture/infrastructure.

The PostgreSQL concurrency suite is compiled at `tests/integration/olist-rate-governor.test.ts`; this workspace has no `DATABASE_URL_TEST`, so Vitest reports it skipped. CI with that variable is the mandatory load-bearing gate.
