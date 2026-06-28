const XLSX = require('xlsx');
const path = require('path');

const file = path.join(__dirname, 'public/formular/01_formular_horizontalni_zaluzie_Isoline_Loco_Prim_Eco.xls');
const workbook = XLSX.readFile(file);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// Read rows 1 to 15, columns A to Z
for (let r = 1; r <= 15; r++) {
  let rowStr = `${r}: `;
  for (let c = 0; c < 26; c++) {
    const colChar = String.fromCharCode(65 + c);
    const cell = sheet[`${colChar}${r}`];
    rowStr += `${colChar}:[${cell ? cell.v : ''}] `;
  }
  console.log(rowStr);
}
