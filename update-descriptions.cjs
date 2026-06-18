const { Pool } = require('pg');
require('dotenv').config();
const sslFromUrl = /sslmode=require/i.test(process.env.DATABASE_URL || '');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: sslFromUrl ? { rejectUnauthorized: false } : undefined });

const descs = {
  'Venkovní žaluzie': 'Nejčastěji používaný exteriérový stínící prvek. Umožňují plynule regulovat přirozené osvětlení, zachycují přímé sluneční záření a chrání před jeho škodlivými účinky.',
  'Screenové rolety': 'Moderní a elegantní prvek exteriérového i interiérového stínění. Díky speciální screenové látce poskytují vynikající ochranu proti tepelnému slunečnímu záření.',
  'Venkovní rolety': 'Účinná tepelná i zvuková izolace. Chrání vaše okna před nepříznivými vlivy počasí, prodlužují jejich životnost a zvyšují bezpečnost vašeho domova.',
  'Horizontální žaluzie': 'Nejpoužívanější interiérový stínící prvek pro svoji jednoduchost, rychlost montáže, minimální nároky na údržbu a cenovou dostupnost.',
  'Látkové žaluzie plisé': 'Skládaná látková žaluzie (plisé) oblékne vaše okna. Nabízí moderní design, variabilitu a širokou škálu materiálů a barev.',
  'Textilní rolety': 'Klasické okenní rolety plní nejen funkci stínění, ale jsou i důležitým designovým prvkem interiéru. Nabízíme široký výběr látek a vzorů.',
  'Textilní rolety DEN / NOC': 'Nová generace rolet (Day & Night). Střídání průhledných a neprůhledných pruhů umožňuje plynulou regulaci světla v místnosti.',
  'Vertikální žaluzie': 'Elegantní řešení stínění pro velké i malé plochy. Ideální pro rozdělení velkých a účelových prostor a sjednocení celkového designu i velkých prosklených ploch.',
  'Pevné okenní sítě rámové': 'Praktická ochrana proti nepříjemnému hmyzu. Jednoduchá instalace na okenní rám. Kvalitní materiály zaručují dlouhou životnost.',
  'Pevné dveřní sítě rámové': 'Ochrana proti hmyzu pro vaše dveře. Pevný hliníkový rám zajišťuje stabilitu a snadnou manipulaci. Vhodné na balkón, terasu atd.'
};

async function run() {
  for (const [title, desc] of Object.entries(descs)) {
    const htmlDesc = '<p>' + desc + '</p><ul><li>Vysoká kvalita a dlouhá trvanlivost</li><li>Vyrobeno přesně na míru dle zadaných rozměrů</li><li>Široké spektrum barevných a materiálových provedení</li></ul>';
    await pool.query('UPDATE "Product" SET "desc" = $1 WHERE title = $2', [htmlDesc, title]);
  }
  console.log('Descriptions updated');
  pool.end();
}
run();
