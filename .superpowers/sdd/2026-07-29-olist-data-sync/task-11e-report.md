# Task 11E — post-readiness activation and E2E

## Scope

- Automatic activation is attempted only after `orders_prepare` publishes canonical `ready` and completes its lease.
- Activation failure is isolated from preparation state; a ready cursor is never rewritten as blocked/error.
- Kill switch and exact organization allowlist are checked before the automatic call, with the transactional repository remaining the final authority.
- The preparation cron performs a bounded recovery sweep for already-ready generations that left the normal preparation queue.
- Playwright uses one deterministic organization allowlisted only inside its test web server.

## TDD evidence

- RED — `tests/unit/prepare-olist.test.ts`: ready publication completed without calling `activateErp` (1 expected failure).
- GREEN — same suite: 25/25 passed.
- RED — `tests/unit/preparar-olist-route.test.ts`: ready recovery sweep was never invoked (2 expected failures).
- GREEN — both targeted suites: 33/33 passed.

## Local verification

- `npm test -- tests/unit/prepare-olist.test.ts tests/unit/preparar-olist-route.test.ts --run --reporter=dot` — 33/33 passed.
- `npm run typecheck` — passed.
- `npm run lint` — 0 errors; 22 pre-existing warnings.
- Playwright local execution was blocked before test collection because `DATABASE_URL_TEST` is not configured locally. PostgreSQL/E2E evidence must come from CI.

## CI evidence

Pending commit and GitHub Actions run.
