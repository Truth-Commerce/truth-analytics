import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { serverEnv } from '@/lib/env';

const client = postgres(serverEnv.POSTGRES_URL, { prepare: false });

export const db = drizzle(client);
export type DatabaseClient = typeof db;
