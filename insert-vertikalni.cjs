const { Pool } = require('pg');
require('dotenv').config();
const sslFromUrl = /sslmode=require/i.test(process.env.DATABASE_URL || '');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: sslFromUrl ? { rejectUnauthorized: false } : undefined });

async function run() {
  const colors = [
    { name: "SONIA" },
    { name: "EVELYN" },
    { name: "POLLY" },
    { name: "RONNIE" },
    { name: "CAROL" },
    { name: "INEZ" },
    { name: "CORRA" },
    { name: "BEATA" },
    { name: "SANDRA" },
    { name: "SONIA FR" },
    { name: "RAY" }
  ];

  const insertRes = await pool.query(
    `INSERT INTO "Product" (title, category, price, img, "desc", validation_profile, width_mm_min, width_mm_max, height_mm_min, height_mm_max, price_mode, colors)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb) RETURNING id`,
     ['Vertikální žaluzie - Standart', 'Interiérové stínění', 0, 'https://placehold.co/600x400/eeeeee/888888?text=Vertikalni+zaluzie', 'Vertikální žaluzie Standart pro elegantní a praktické zastínění větších ploch. Na výběr jsou různé typy látek a barev, které ovlivňují cenu podle zvolené výšky.', 'vertikalni_zaluzie', 400, 6000, 400, 6000, 'vertikalni_zaluzie', JSON.stringify(colors)]
  );
  
  console.log("inserted vertikalni zaluzie. New id:", insertRes.rows[0].id);
  pool.end();
}
run();
