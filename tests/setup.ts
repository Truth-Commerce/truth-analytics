import { config } from 'dotenv';

config({ path: '.env.local' });

// Safety: during tests, the app DB client must point at the dedicated Neon
// `test` branch or an unreachable local unit-test URL, never `main`
// (production). serverEnv is parsed lazily-once on first import of '@/lib/env',
// so this redirect must happen here in setupFiles, before any test module loads.
const UNIT_DB_URL = 'postgresql://unit:unit@127.0.0.1:5432/truth_analytics_unit';
const UNIT_AUTH_SECRET = 'truth-analytics-unit-test-secret';
const UNIT_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

if (process.env.DATABASE_URL_TEST) {
  process.env.POSTGRES_URL = process.env.DATABASE_URL_TEST;
  process.env.POSTGRES_URL_DIRECT =
    process.env.DATABASE_URL_TEST_DIRECT ?? process.env.DATABASE_URL_TEST;
} else {
  process.env.POSTGRES_URL = UNIT_DB_URL;
  process.env.POSTGRES_URL_DIRECT = UNIT_DB_URL;
}

process.env.AUTH_SECRET = UNIT_AUTH_SECRET;
process.env.ENCRYPTION_KEY = UNIT_ENCRYPTION_KEY;
delete process.env.ENCRYPTION_KEYS;
delete process.env.ENCRYPTION_KEY_ACTIVE;

// INVARIANTE: testes de integração que usem o client do app (`@/db/client`)
// permanecem protegidos por `describe.skipIf(!process.env.DATABASE_URL_TEST)`;
// sem esse guard, eles tentariam usar a URL local inalcançável das unit tests.
// Mantenha as duas proteções em sincronia.
