const ExcelJS = require('exceljs');
const path = require('path');

async function run() {
  const file1 = path.join(__dirname, 'public/formular/07_formular_pevne_site_proti_hmyzu_okenni.xlsx');
  const wb1 = new ExcelJS.Workbook();
  await wb1.xlsx.readFile(file1);
  const sh1 = wb1.worksheets[0];
  console.log('--- OKENNI SITE ---');
  for (let i = 1; i <= 10; i++) {
    const row = sh1.getRow(i);
    let vals = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      vals.push(`${colNumber}:${cell.value}`);
    });
    console.log(`Row ${i}:`, vals.join(' | '));
  }
}

run().catch(console.error);
