const fs = require('fs');
const path = require('path');

const serverFile = 'c:/Users/ludvi/Desktop/eshop-qapi/server.ts';
let content = fs.readFileSync(serverFile, 'utf8');

const startStr = '  app.get("/api/admin/orders/:id/export-textilni-roletky"';
const endStr = '  app.patch("/api/admin/orders/:id"';

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr);

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find start or end index.");
  process.exit(1);
}

const newEndpoint = `  app.get("/api/admin/orders/:id/export-textilni-roletky", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id < 1) {
          res.status(400).json({ error: "Neplatné ID" });
          return;
        }
        const o = await db.query('SELECT * FROM "Order" WHERE id = $1', [id]);
        if (!o.rows[0]) {
          res.status(404).json({ error: "Nenalezeno" });
          return;
        }
        const order = o.rows[0];
        const items = await db.query(
          'SELECT * FROM "OrderItem" WHERE order_id = $1 ORDER BY id ASC',
          [id]
        );

        const textilniItems = items.rows.filter((item: any) => 
          (item.product_title || '').toLowerCase().includes('textilní rolet') ||
          (item.product_title || '').toLowerCase().includes('textilni rolet')
        );

        if (textilniItems.length === 0) {
          res.status(404).json({ error: "Objednávka neobsahuje žádné Textilní roletky" });
          return;
        }

        const templatePath = path.join(process.cwd(), 'public', 'formular', '05_formular_textilni_roletky_Jazz.xlsx');
        if (!fs.existsSync(templatePath)) {
           res.status(404).json({ error: "Šablona formuláře nebyla nalezena." });
           return;
        }

        // We use ExcelJS to preserve images and formatting!
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(templatePath);
        const sheet = workbook.worksheets[0];

        const addr = [order.delivery_street, order.delivery_city, order.delivery_zip].filter(Boolean).join(', ');
        
        sheet.getCell('D1').value = "Ropemi s.r.o., Varšavská 715/36, Vinohrady, 120 00 Praha 2";
        sheet.getCell('D3').value = addr;
        sheet.getCell('D5').value = "+420 774 060 193";
        sheet.getCell('M3').value = new Date(order.date).toLocaleDateString('cs-CZ');
        sheet.getCell('R3').value = order.order_no;

        let currentRow = 10; // Data starts at row 10 in ExcelJS (1-indexed)
        textilniItems.forEach((item: any, index: number) => {
          const params = item.options?.selected_parameters || {};
          const w = item.width_mm || 0;
          const h = item.height_mm || 0;
          const qty = item.quantity;
          
          let typRoletky = "Textilní roletka";
          if ((item.product_title || '').toLowerCase().includes('jazz expert')) {
            typRoletky = "JAZZ Expert";
          } else if ((item.product_title || '').toLowerCase().includes('optima den a noc')) {
            typRoletky = "Optima Den a noc";
          } else if ((item.product_title || '').toLowerCase().includes('optima')) {
            typRoletky = "Optima";
          }
          
          const montazniProfil = params.montazni_profil === 'ano' ? 'ANO' : 'NE';
          let provedeni = '';
          if (params.montazni_profil_typ === 'samostatne') provedeni = '1 - samostatně';
          else if (params.montazni_profil_typ === 'kompletni') provedeni = '2 - kompletní';
          
          let barvaProfilu = '';
          if (params.barva_profilu_montaz === 'bila') barvaProfilu = 'A - bílá';
          else if (params.barva_profilu_montaz === 'hneda') barvaProfilu = 'B - hnědá';
          else if (params.barva_profilu_montaz === 'antracit') barvaProfilu = 'C - antracit';

          let odvijeni = '';
          if (params.odvijeni === 'ke_zdi') odvijeni = '1 - ke zdi';
          else if (params.odvijeni === 'ode_zdi') odvijeni = '2 - ode zdi';
          
          let uchyceni = '';
          if (params.uchyceni === 'stena_kridlo') uchyceni = '1 - stěna, křídlo';
          else if (params.uchyceni === 'strop') uchyceni = '2 - strop';
          
          const m2 = ((w * h) / 1000000).toFixed(2);
          const customerDetails = \`\${order.customer_name}, Tel: \${order.customer_phone || '-'}, E-mail: \${order.customer_email || '-'}\`;
          
          let poznamka = \`Plocha: \${m2} m2 | Zákazník: \${customerDetails}\`;
          if (params.poznamka) poznamka += \` | Pozn. zákazníka: \${params.poznamka}\`;

          // Copy formatting from previous row if needed, but since it's a template we just set values.
          sheet.getCell(\`A\${currentRow}\`).value = index + 1 + '.';
          sheet.getCell(\`C\${currentRow}\`).value = typRoletky;
          sheet.getCell(\`E\${currentRow}\`).value = qty;
          sheet.getCell(\`F\${currentRow}\`).value = w;
          sheet.getCell(\`G\${currentRow}\`).value = h;
          sheet.getCell(\`H\${currentRow}\`).value = params.ovladani_strana || '';
          sheet.getCell(\`I\${currentRow}\`).value = 'Ř';
          // Skip elektronika (J) and délka (K)
          sheet.getCell(\`L\${currentRow}\`).value = montazniProfil;
          sheet.getCell(\`M\${currentRow}\`).value = provedeni;
          sheet.getCell(\`N\${currentRow}\`).value = barvaProfilu;
          sheet.getCell(\`O\${currentRow}\`).value = params.lamela_typ || '';
          sheet.getCell(\`P\${currentRow}\`).value = params.barva_komponentu || '';
          sheet.getCell(\`Q\${currentRow}\`).value = odvijeni;
          sheet.getCell(\`R\${currentRow}\`).value = uchyceni;
          sheet.getCell(\`S\${currentRow}\`).value = 'NE';
          sheet.getCell(\`T\${currentRow}\`).value = poznamka;
          
          currentRow++;
        });

        res.setHeader('Content-Disposition', \`attachment; filename="Objednavka_TextilniRoletky_\${order.order_no}.xlsx"\`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        
        await workbook.xlsx.write(res);
        res.end();

      } catch (err) {
        console.error('Textilni roletky export error:', err);
        res.status(500).json({ error: "Server error při generování Excelu" });
      }
    });
  });

`;

content = content.substring(0, startIndex) + newEndpoint + content.substring(endIndex);
fs.writeFileSync(serverFile, content, 'utf8');
console.log("Updated endpoint successfully with ExcelJS.");
