const ExcelJS = require('exceljs');
const path = require('path');

async function run() {
  const file1 = path.join(__dirname, 'public/formular/07_formular_pevne_site_proti_hmyzu_okenni.xlsx');
  const file2 = path.join(__dirname, 'public/formular/07_formular_pevne_site_proti_hmyzu_dverni.xlsx');

  const wb1 = new ExcelJS.Workbook();
  await wb1.xlsx.readFile(file1);
  const sh1 = wb1.worksheets[0];
  console.log('--- OKENNI SITE ---');
  for (let i = 1; i <= 20; i++) {
    const row = sh1.getRow(i);
    let vals = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      vals.push(`${colNumber}:${cell.value}`);
    });
    console.log(`Row ${i}:`, vals.join(' | '));
  }

  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile(file2);
  const sh2 = wb2.worksheets[0];
  console.log('\n--- DVERNI SITE ---');
  for (let i = 1; i <= 20; i++) {
    const row = sh2.getRow(i);
    let vals = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      vals.push(`${colNumber}:${cell.value}`);
    });
    console.log(`Row ${i}:`, vals.join(' | '));
  }
}

run().catch(console.error);
