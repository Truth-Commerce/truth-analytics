# Task 3 report

## Delivered

- Dedicated `OLIST_ACCOUNT_FINGERPRINT_KEY` HMAC account fingerprinting with no encryption-key fallback.
- `/info` account binding after OAuth token CAS and before callback success; failures redirect safely as `olist_conta_nao_validada`.
- OAuth callback publication now keeps exchanged tokens out of persistence until `/info` has returned and a `FOR UPDATE` credential-CAS transaction atomically writes token set, binding fingerprint, next data generation and cleared readiness.
- Olist data requests load the required fingerprint internally, use one 60-second absolute deadline across reservation, token read, HTTP/body, rate-header observation and forced 401 renewal/replay.
- Refresh OAuth accepts the propagated abort signal/deadline; its request/body and capped Retry-After delay cannot extend the caller budget.
- Provider waiter migration `0023`, schema table, injectable SQL governor factory, and bounded Olist HTTP client.
- Plan renumbering reserves `0023` for waiters and moves sync-state shadow enable to `0024`.

## RED / GREEN

The two initial account tests were observed RED against explicit `not_implemented` stubs and are documented in `task-3-red.md`. Their GREEN rerun passed.

## Verification

- Passed: account, OAuth route, and HTTP focal unit suites (12 tests).
- Passed: TypeScript typecheck and `git diff --check`.
- Skipped honestly: PostgreSQL integration suite; no `DATABASE_URL_TEST` or `.env.local` exists in this worktree. CI must run it after applying migrations.

## Residual risks

The local environment cannot demonstrate PostgreSQL fairness/FIFO/SLO or binding race behavior. The current governor persists SQL state and has an injectable factory, but the CI integration gate must exercise the full concurrent waiter matrix before merge.
