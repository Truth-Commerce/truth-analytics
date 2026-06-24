import { config } from 'dotenv';

config({ path: '.env.local' });

// Safety: during tests, the app DB client must point at the dedicated Neon
// `test` branch, never `main` (production). serverEnv is parsed lazily-once on
// first import of '@/lib/env', so this redirect must happen here in setupFiles,
// before any test module loads.
if (process.env.DATABASE_URL_TEST) {
  process.env.POSTGRES_URL = process.env.DATABASE_URL_TEST;
  process.env.POSTGRES_URL_DIRECT =
    process.env.DATABASE_URL_TEST_DIRECT ?? process.env.DATABASE_URL_TEST;
}

// INVARIANTE: quando DATABASE_URL_TEST está ausente, o redirect acima NÃO roda e
// POSTGRES_URL permanece apontando para `main` (produção). Por isso, TODO teste
// de integração que use o client do app (`@/db/client`) DEVE estar protegido por
// `describe.skipIf(!process.env.DATABASE_URL_TEST)`. Sem esse guard, um teste
// rodaria contra produção. Mantenha as duas proteções em sincronia.
