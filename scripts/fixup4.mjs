import fs from 'fs';
import path from 'path';

const dir = './scripts';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.mjs') && f.startsWith('import-'));

for (const file of files) {
  const p = path.join(dir, file);
  let content = fs.readFileSync(p, 'utf-8');

  content = content.replace(/"Interiérové stínění"/g, '"cat_interier"');
  content = content.replace(/"Screenové rolety"/g, '"cat_venkovni"');
  content = content.replace(/"Venkovní rolety"/g, '"cat_venkovni"');
  content = content.replace(/"EXT\/INT žaluzie"/g, '"cat_venkovni"');
  
  // also Vertikální žaluzie is Interiérové stínění
  // Den a noc is Interiérové stínění
  content = content.replace(/"Vertikální žaluzie"/g, '"cat_interier"');
  content = content.replace(/"Rolety Den a noc"/g, '"cat_interier"');

  fs.writeFileSync(p, content, 'utf-8');
}
console.log('Fixed categories!');
