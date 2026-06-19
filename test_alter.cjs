require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

client.connect()
  .then(() => client.query('ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS slug VARCHAR(255) UNIQUE'))
  .then(() => { console.log('success'); return client.end(); })
  .catch(e => { console.error('Error:', e); return client.end(); });
