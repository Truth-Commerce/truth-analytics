import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { serverEnv } from '@/lib/env';

// Binding runs a short, row-locked publication transaction. Keeping it on its
// own single-connection pool avoids starving the general application pool and
// makes lock ownership deterministic under concurrent OAuth callbacks.
const client = postgres(serverEnv.POSTGRES_URL, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const olistBindingDb = drizzle(client);
