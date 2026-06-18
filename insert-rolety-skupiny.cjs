const { Pool } = require('pg');
require('dotenv').config();
const sslFromUrl = /sslmode=require/i.test(process.env.DATABASE_URL || '');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: sslFromUrl ? { rejectUnauthorized: false } : undefined });

const rawText = `605	874	933	991	1 049	1 105	1 163	1 221	1 279	1 336	1 394	1 452
726	904	966	1 026	1 088	1 148	1 208	1 269	1 331	1 392	1 452	1 514
847	934	998	1 062	1 127	1 191	1 255	1 319	1 383	1 447	1 510	1 574
968	964	1 031	1 099	1 165	1 233	1 300	1 366	1 434	1 503	1 569	1 636
1 089	995	1 065	1 134	1 205	1 275	1 346	1 416	1 486	1 555	1 625	1 696
1 210	1 025	1 097	1 171	1 245	1 316	1 392	1 464	1 538	1 611	1 684	1 758
1 331	1 055	1 130	1 206	1 283	1 360	1 436	1 512	1 588	1 665	1 741	1 817
1 452	1 087	1 164	1 244	1 324	1 404	1 482	1 561	1 641	1 721	1 799	1 879
1 573	1 116	1 198	1 280	1 362	1 446	1 526	1 611	1 692	1 776	1 857	1 941
1 694	1 146	1 231	1 315	1 401	1 487	1 574	1 659	1 745	1 830	1 915	2 001
1 815	1 175	1 264	1 353	1 442	1 529	1 618	1 707	1 796	1 884	1 972	2 063
1 936	1 205	1 297	1 388	1 481	1 573	1 665	1 756	1 848	1 941	2 032	2 124
2 057	1 235	1 330	1 424	1 520	1 614	1 710	1 807	1 900	1 995	2 090	2 185
2 178	1 266	1 364	1 462	1 558	1 656	1 754	1 853	1 952	2 051	2 149	2 246
2 299	1 296	1 396	1 497	1 600	1 701	1 800	1 902	2 003	2 103	2 205	2 307
2 420	1 326	1 429	1 535	1 638	1 744	1 846	1 952	2 056	2 160	2 264	2 367`;

async function run() {
  const fgConfig = [
    { name: "Skupina 1", surcharge_percent: 0, colors: [] },
    { name: "Skupina 2", surcharge_percent: 10, colors: [] },
    { name: "Skupina 3", surcharge_percent: 20, colors: [] },
    { name: "Skupina 4", surcharge_percent: 30, colors: [] },
  ];

  const insertRes = await pool.query(
    `INSERT INTO "Product" (title, category, price, img, "desc", validation_profile, width_mm_min, width_mm_max, height_mm_min, height_mm_max, price_mode, fabric_groups_config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb) RETURNING id`,
     ['Látkové rolety - Skupiny', 'Interiérové stínění', 0, 'https://placehold.co/600x400/eeeeee/888888?text=Latkove+Rolety', 'Látkové rolety s možností výběru z více skupin látek.', 'rolety_skupiny', 500, 1500, 605, 2420, 'matrix_cell_fabric_surcharge', JSON.stringify(fgConfig)]
  );
  
  const pid = insertRes.rows[0].id;
  
  let sort = 10;
  for (const row of rawText.split('\n')) {
    if (!row.trim()) continue;
    const parts = row.trim().replace(/ /g, '').split(/\t+/).map(Number);
    const h = parts[0];
    const widths = [500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500];
    for (let i = 0; i < widths.length; i++) {
        const w = widths[i];
        const price = parts[i + 1];
        if (price) {
           await pool.query(
             'INSERT INTO "ProductPriceBracket" (product_id, width_mm_max, height_mm_max, base_price_czk, sort_order) VALUES ($1, $2, $3, $4, $5)',
             [pid, w, h, price, sort++]
           );
        }
    }
  }
  
  console.log("inserted rolety. New id:", pid);
  pool.end();
}
run();
