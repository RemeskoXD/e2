import fs from 'fs';
import path from 'path';

const dir = './scripts';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.mjs') && f.startsWith('import-'));

for (const file of files) {
  const p = path.join(dir, file);
  let content = fs.readFileSync(p, 'utf-8');

  // Any INSERT INTO "Product" that has VALUES ( $1  will be replaced to have an id generated
  content = content.replace(/INSERT INTO "Product" \([\s\S]*?VALUES \( \$1/g, match => {
     return match.replace(/VALUES \( \$1/, "VALUES ('prd_' || substr(md5(random()::text), 1, 10), $1");
  });

  fs.writeFileSync(p, content, 'utf-8');
}
console.log('Fixed scripts again part 3!');
