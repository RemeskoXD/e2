import { Pool } from 'pg';
import { computeProductQuote } from './quote-compute';
import dotenv from 'dotenv';
dotenv.config();

const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function test() {
  const pRes = await db.query(`SELECT id FROM "Product" WHERE slug = 'plise-zaluzie-lagarta'`);
  if (!pRes.rows[0]) {
    console.log('Product not found');
    process.exit(1);
  }
  const id = pRes.rows[0].id;
  const body = {
    fabric_group_config_index: 0,
    model: 'PM1',
  };
  const res = await computeProductQuote(db, id, 1000, 1000, body);
  console.log(res);
  process.exit(0);
}
test();
