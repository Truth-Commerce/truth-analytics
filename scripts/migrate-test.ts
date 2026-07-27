import { config } from 'dotenv';
import { resolveTestDatabaseUrls } from '../src/lib/test-database-safety';

config({ path: '.env.local' });

async function main() {
  // Validate before importing postgres/drizzle, which could otherwise create a
  // client for an unsafe target.
  const { directUrl } = resolveTestDatabaseUrls(process.env);
  const [{ drizzle }, { migrate }, { default: postgres }] = await Promise.all([
    import('drizzle-orm/postgres-js'),
    import('drizzle-orm/postgres-js/migrator'),
    import('postgres'),
  ]);
  const sql = postgres(directUrl, { prepare: false, max: 1 });
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
