import fs from 'fs';
import path from 'path';

const dir = './scripts';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.mjs') && f.startsWith('import-'));

for (const file of files) {
  const p = path.join(dir, file);
  let content = fs.readFileSync(p, 'utf-8');

  // Fix foreign key type
  content = content.replace(/product_id INTEGER NOT NULL/g, 'product_id TEXT NOT NULL');

  // Fix SELECT title -> name
  content = content.replace(/WHERE title =/g, 'WHERE name =');

  // Fix UPDATE properties
  content = content.replace(/SET title=\$2, category=\$3, price=\$4, img=\$5, "desc"=\$6/g, 'SET name=$2, "categoryId"=$3, "priceCzk"=$4, image=$5, description=$6');
  content = content.replace(/SET category=\$2, price=\$3, img=\$4, "desc"=\$5/g, 'SET "categoryId"=$2, "priceCzk"=$3, image=$4, description=$5');

  // Fix INSERT properties (and inject id generation)
  // For: INSERT INTO "Product" (title, category, price, "oldPrice", badge, img, "desc", ...
  // Or: INSERT INTO "Product" (title, category, price, badge, img, "desc", ...
  content = content.replace(/INSERT INTO "Product" \(\s*title,\s*category,\s*price,\s*"oldPrice",\s*badge,\s*img,\s*"desc"/g, 'INSERT INTO "Product" (id, name, "categoryId", "priceCzk", "oldPrice", badge, image, description');
  content = content.replace(/INSERT INTO "Product" \(\s*title,\s*category,\s*price,\s*badge,\s*img,\s*"desc"/g, 'INSERT INTO "Product" (id, name, "categoryId", "priceCzk", badge, image, description');

  // Now the values array has $1, $2, $3...
  // We need to inject an ID generation, so $1 becomes UUID, $2 is title...
  // Let's replace `VALUES ($1, $2,` with `VALUES ('prd_' || substr(md5(random()::text), 1, 10), $1, $2,`
  content = content.replace(/VALUES \(\$1,\s*\$2/g, "VALUES ('prd_' || substr(md5(random()::text), 1, 10), $1, $2");

  // Also we need to make sure the RETURNING id works. It already does.
  
  // Also add missing columns to ensureSchema
  const addCols = `
    await client.query('ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "oldPrice" INTEGER').catch(()=>{});
    await client.query('ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS badge VARCHAR(50)').catch(()=>{});
  `;
  if (!content.includes('"oldPrice" INTEGER')) {
     content = content.replace(/ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS max_area_m2 NUMERIC\(6,2\)/, 'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS max_area_m2 NUMERIC(6,2)`,\n`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "oldPrice" INTEGER`,\n`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS badge VARCHAR(50)');
  }

  // Also fix ensureSchema CREATE TABLE "Product" so it has correct fields (just in case)
  content = content.replace(/CREATE TABLE IF NOT EXISTS "Product" \([\s\S]*?\);/g, `CREATE TABLE IF NOT EXISTS "Product" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "categoryId" TEXT,
      "priceCzk" INTEGER,
      "oldPrice" INTEGER,
      badge VARCHAR(50),
      image TEXT,
      description TEXT
    );`);

  fs.writeFileSync(p, content, 'utf-8');
}
console.log('Fixed scripts!');
