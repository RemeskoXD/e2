import fs from 'fs';
import path from 'path';

const dir = './scripts';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.mjs') && f.startsWith('import-'));

for (const file of files) {
  const p = path.join(dir, file);
  let content = fs.readFileSync(p, 'utf-8');

  // Re-read and apply carefully this time based on the `Product` table specifically.
  // We need to revert the generic VALUES replace and re-apply it only for Product inserts
  content = content.replace(/VALUES \('prd_' \|\| substr\(md5\(random\(\)::text\), 1, 10\),/g, "VALUES (");
  
  // Now explicitly add ID generator only for INSERT INTO Product
  content = content.replace(/INSERT INTO "Product" \([\s\S]*?VALUES \(\$1,\s*\$2/g, match => {
    return match.replace(/VALUES \(\$1,\s*\$2/, "VALUES ('prd_' || substr(md5(random()::text), 1, 10), $1, $2");
  });

  fs.writeFileSync(p, content, 'utf-8');
}
console.log('Fixed scripts again!');
