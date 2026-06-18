import fs from "fs";
import { PDFParse } from "pdf-parse";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/dump-pdf-text.mjs <pdf>");
  process.exit(1);
}
const buf = fs.readFileSync(path);
const parser = new PDFParse({ data: buf });
const tr = await parser.getText();
await parser.destroy();
console.log("--- pages:", tr.total);
console.log(tr.text.slice(0, 30000));
