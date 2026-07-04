import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { serverEnv } from '@/lib/env';

// Serverless (Vercel): cada invocação tem sua própria instância do módulo —
// pool grande só esgota as conexões do Neon. max:1 + idle_timeout curto.
// Dev/scripts locais (seed, reencrypt) podem subir via DB_POOL_MAX.
const isServerless = Boolean(process.env.VERCEL);
const max = serverEnv.DB_POOL_MAX ?? (isServerless ? 1 : 4);

const client = postgres(serverEnv.POSTGRES_URL, {
  prepare: false,
  max,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client);
export type DatabaseClient = typeof db;
