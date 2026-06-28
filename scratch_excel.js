const XLSX = require('xlsx');
const path = require('path');

const p = path.join(__dirname, 'public/formular/05_formular_textilni_roletky_Jazz.xlsx');
const workbook = XLSX.readFile(p);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

const range = XLSX.utils.decode_range(sheet['!ref']);
for (let R = 0; R <= Math.min(20, range.e.r); ++R) {
    let row = '';
    for (let C = 0; C <= Math.min(20, range.e.c); ++C) {
        const cell = sheet[XLSX.utils.encode_cell({c: C, r: R})];
        row += `| ${String(cell ? cell.v : '').substring(0, 15).padEnd(15)} `;
    }
    console.log(`R${R+1}:`, row);
}
