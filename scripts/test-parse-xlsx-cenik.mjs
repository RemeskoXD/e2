import path from "path";
import XLSX from "xlsx";
import { parseWorkbook } from "./import-xlsx-m2-height-cenik.mjs";

const p = path.resolve(
  process.argv[2] || "c:/Users/ludvi/Desktop/Qapieshop/Katalogy/04_CENIK_vertikalni_zaluzie_DPH.xlsx"
);
const wb = XLSX.readFile(p);
const { blocks } = parseWorkbook(wb);
console.log("fabrics:", blocks.length);
for (const b of blocks) {
  console.log(b.fabricName, "tiers", b.tiers.length, "first", b.tiers[0], "last", b.tiers[b.tiers.length - 1]);
}
