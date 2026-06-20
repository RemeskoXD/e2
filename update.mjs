import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    const slug = 'dverni-site-proti-hmyzu';
    const img = '/images/dverni_sit_cover.png';
    const desc = '<p>Přizpůsobte si <strong>dveřní sítě proti hmyzu</strong> na míru a zbavte se nechtěných návštěvníků. Nabízíme vysoce kvalitní modely s rámem (luxusní provedení pro vyšší stabilitu a exkluzivní vzhled) i odlehčené varianty bez rámu, ideální pro čistý a nenápadný design.</p><p>K dispozici jsou špičkové profily <strong>DE 50x20</strong> a vylepšené prémie <strong>DE 40x20 Lux</strong>. Naše sítě poskytují naprosto plynulý chod, precizní magnetické dovírání a dlouholetou životnost i při každodenním náročném užívání. Zvolit si můžete standardní odolnou síťovinu, protipylové varianty pro alergiky nebo speciální transparentní verzi, která téměř není vidět. Obrovskou volnost máte také ve výběru povrchové úpravy od základu až po precizní imitaci dřeva či elegantní perleťové laky.</p>';
    
    await pool.query('UPDATE "Product" SET img = $1, "desc" = $2 WHERE slug = $3', [img, desc, slug]);
    console.log("DB Updated directly.");
    
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
