const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: /sslmode=require/i.test(process.env.DATABASE_URL || '') ? { rejectUnauthorized: false } : undefined });

async function run() {
  const res = await pool.query('SELECT title, parameters, extras FROM "Product" LIMIT 1');
  console.log(JSON.stringify(res.rows, null, 2));
  pool.end();
}
run();
