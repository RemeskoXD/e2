import XLSX from "xlsx";
import path from "path";

const p = path.resolve(process.argv[2] || "c:/Users/ludvi/Desktop/Qapieshop/Katalogy/04_CENIK_vertikalni_zaluzie_DPH.xlsx");
const wb = XLSX.readFile(p, { cellDates: true });
console.log("Sheets:", wb.SheetNames);
for (const name of wb.SheetNames) {
  const sh = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });
  console.log("\n===", name, "rows:", data.length);
  for (let i = 0; i < Math.min(40, data.length); i++) {
    console.log(i, JSON.stringify(data[i]));
  }
}
