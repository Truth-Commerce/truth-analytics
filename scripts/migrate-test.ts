import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL_TEST_DIRECT ?? process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST ausente — defina no .env.local');
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: './src/db/migrations' });
    console.info('[migrate-test] branch de teste migrado com sucesso');
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
