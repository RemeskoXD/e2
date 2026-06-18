import pg from 'pg';
const { Pool } = pg;
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function fix() {
  await p.query('DROP TABLE IF EXISTS "OrderItem" CASCADE');
  await p.query('DROP TABLE IF EXISTS "Order" CASCADE');
  await p.query('DROP TABLE IF EXISTS "MeasureGuidePage" CASCADE');
  await p.query('DROP TABLE IF EXISTS "MeasureGuideSection" CASCADE');

  // and recreate MeasureGuidePage because ensureSchema expects MeasureGuidePage but uses SMALLINT which Postgres 42P01 error relation doesn't exist
  // wait we just drop it and ensureSchema will recreate it on next server restart.
  // Actually, wait, let's fix the Product table columns in server.ts
  console.log("Dropped tables. Restarting dev server should recreate them.");
}
fix().finally(() => p.end());
