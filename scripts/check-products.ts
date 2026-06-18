import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("No DATABASE_URL");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString?.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('SET search_path TO "public"');
    
    // First, check if hidden column exists
    try {
      const res = await client.query('SELECT * FROM "Product" LIMIT 1');
      console.log("Columns in Product table:");
      if (res.fields) {
        console.log(res.fields.map(f => f.name).join(", "));
      }
    } catch (err: any) {
      console.error("Error reading Product table:", err.message);
    }
    
    // Now check the query
    try {
      const res2 = await client.query('SELECT * FROM "Product" WHERE hidden IS NOT TRUE');
      console.log("Total rows unhidden:", res2.rowCount);
    } catch (err: any) {
      console.error("Error on unhidden query:", err.message);
    }

  } catch (err: any) {
    console.error("Database connection Error:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}
run();
