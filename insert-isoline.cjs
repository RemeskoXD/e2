const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /sslmode=require/i.test(process.env.DATABASE_URL || '') ? { rejectUnauthorized: false } : undefined
});

const rawText = `300 263 283 304 323 359 377 395 422 441 456 476 525 537 558 578 593 616 656 680 695
400 277 297 316 335 381 397 422 448 469 487 518 558 582 599 621 641 660 713 738 759
500 284 305 328 351 393 416 441 473 494 514 536 591 616 636 656 680 702 756 779 802
600 301 323 341 369 416 437 464 499 528 550 575 634 658 660 704 732 753 814 859 872
700 309 333 361 390 441 467 490 534 557 576 611 677 702 724 752 779 805 866 912 946
800 324 359 376 407 456 486 512 557 585 605 637 706 736 763 794 819 844 915 962 1013
900 333 365 393 422 476 509 537 585 619 646 678 747 778 810 839 870 897 970 1003 1083
1000 346 377 411 445 499 531 564 619 646 680 713 789 821 855 886 915 949 1025 1065 1116
1100 357 390 426 458 518 554 585 641 676 710 744 822 858 892 925 959 994 1071 1120 1171
1200 372 407 442 476 539 578 612 678 708 744 809 863 900 939 975 1009 1045 1127 1171 1208
1300 381 422 463 495 561 596 636 697 737 777 816 901 942 981 1021 1054 1096 1182 1228 1322
1400 392 432 472 512 578 621 659 720 763 804 844 939 977 1018 1059 1096 1137 1228 1283 1390
1500 404 447 487 531 599 641 683 749 797 838 883 977 1021 1064 1102 1157 1190 1282 1329 1446
1600 416 463 509 553 621 662 710 778 826 870 918 1016 1063 1106 1152 1194 1239 1321 1397 1487
1700 426 472 519 568 640 683 733 809 855 900 949 1050 1096 1140 1190 1236 1282 1386 1449 1538
1800 441 486 536 584 660 718 759 836 885 935 983 1090 1138 1186 1233 1287 1333 1437 1508 1592
1900 448 499 553 599 678 730 779 859 909 962 1012 1122 1177 1223 1256 1326 1376 1485 1565 1660
2000 463 512 566 621 700 753 804 884 946 998 1045 1162 1219 1268 1316 1374 1427 1537 1623 1729
2100 473 530 581 637 722 777 832 912 977 1028 1075 1205 1256 1310 1367 1422 1484 1594 1660 1796
2200 483 537 597 652 737 795 852 946 1003 1058 1118 1238 1293 1350 1417 1462 1514 1639 1733 1862`;

const parameters = [
  {
    "id": "lamela_type",
    "name": "Typ lamely",
    "type": "select",
    "options": ["25 x 0,18 mm (základní)", "25 x 0,21 mm", "16 x 0,21 mm", "Perforované lamely"],
    "required": true
  },
  {
    "id": "lamela_color",
    "name": "Odstín lamely",
    "type": "select",
    "options": ["Základní odstín", "Příplatkový odstín (č. 780, 783, 1940 atd.)", "Imitace dřeva"],
    "required": true
  },
  {
    "id": "profil_color",
    "name": "Barva horního a dolního profilu",
    "type": "select",
    "options": ["Základní", "Příplatková (RAL)", "Příplatková (Imitace dřeva)"],
    "required": true
  },
  {
    "id": "domykatelne",
    "name": "Domykatelné provedení (celostín)",
    "type": "select",
    "options": ["Ne (Standard)", "Ano (Domykatelné)"],
    "required": true
  },
  {
    "id": "ovladani",
    "name": "Umístění ovládání",
    "type": "select",
    "options": ["Vpravo (ŘP)", "Vlevo (ŘL)"],
    "required": true
  }
];

const extras = [
  {
    "id": "lamela_25_021",
    "name": "Lamela 25 x 0,21 mm",
    "type": "area",
    "price_czk": 74,
    "condition": "lamela_type === '25 x 0,21 mm'"
  },
  {
    "id": "lamela_16_021",
    "name": "Lamela 16 x 0,21 mm",
    "type": "area",
    "price_czk": 74,
    "condition": "lamela_type === '16 x 0,21 mm'"
  },
  {
    "id": "lamela_perfo",
    "name": "Perforované lamely",
    "type": "area",
    "price_czk": 76,
    "condition": "lamela_type === 'Perforované lamely'"
  },
  {
    "id": "lamela_color_priplatek",
    "name": "Příplatkový odstín lamely",
    "type": "area",
    "price_czk": 87,
    "condition": "lamela_color === 'Příplatkový odstín (č. 780, 783, 1940 atd.)'"
  },
  {
    "id": "lamela_color_drevo",
    "name": "Imitace dřeva",
    "type": "area",
    "price_czk": 169,
    "condition": "lamela_color === 'Imitace dřeva' && domykatelne === 'Ne (Standard)'"
  },
  {
    "id": "domykatelne_std",
    "name": "Domykatelné provedení",
    "type": "area",
    "price_czk": 33,
    "condition": "domykatelne === 'Ano (Domykatelné)' && lamela_color !== 'Imitace dřeva'"
  },
  {
    "id": "domykatelne_drevo",
    "name": "Imitace dřeva v domykatelném provedení",
    "type": "area",
    "price_czk": 267,
    "condition": "domykatelne === 'Ano (Domykatelné)' && lamela_color === 'Imitace dřeva'"
  },
  {
    "id": "profil_ral",
    "name": "Profily Al v RAL",
    "type": "width",
    "price_czk": 147,
    "condition": "profil_color === 'Příplatková (RAL)'"
  },
  {
    "id": "profil_drevo",
    "name": "Profily Al v imitaci dřeva",
    "type": "width",
    "price_czk": 131,
    "condition": "profil_color === 'Příplatková (Imitace dřeva)'"
  }
];

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error("No DATABASE_URL set.");
    process.exit(1);
  }

  // Ensure category exists
  let catRes = await pool.query('SELECT id FROM "Category" WHERE name = $1 LIMIT 1', ['Žaluzie']);
  let catId = null;
  if (catRes.rows.length === 0) {
    catRes = await pool.query('INSERT INTO "Category" (name, slug) VALUES ($1, $2) RETURNING id', ['Žaluzie', 'zaluzie']);
    catId = catRes.rows[0].id;
  } else {
    catId = catRes.rows[0].id;
  }

  // Delete old product if exists
  await pool.query('DELETE FROM "Product" WHERE title = $1', ['Horizontální žaluzie Isoline']);

  // Insert product
  const prodRes = await pool.query(`
    INSERT INTO "Product" (
      title, slug, category_id, description, image, price, hidden,
      width_mm_min, width_mm_max, height_mm_min, height_mm_max, max_area_m2,
      price_mode, parameters, extras
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12,
      $13, $14, $15
    ) RETURNING id
  `, [
    'Horizontální žaluzie Isoline', 'horizontalni-zaluzie-isoline', catId, 
    '<p>Základní ceníková sestava s horním a dolním profilem z válcovaného pozinkovaného plechu a hliníkovou lamelou. Žaluzie je dodávaná vždy v interiérovém provedení s čelním vývodem ovládání a s fixací silonovou strunou.</p>', 
    '/zaluzie_isoline.png', 0, false,
    200, 2400, 300, 2500, 2.4,
    'matrix_cell', JSON.stringify(parameters), JSON.stringify(extras)
  ]);

  const pid = prodRes.rows[0].id;

  // Insert price grid
  let sort = 10;
  const widths = [300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200];
  
  for (const row of rawText.split('\\n')) {
    if (!row.trim()) continue;
    const parts = row.trim().split(/\\s+/).map(Number);
    const h = parts[0];
    for (let i = 0; i < widths.length; i++) {
        const w = widths[i];
        const price = parts[i + 1];
        if (price && price > 0) {
           await pool.query(
             'INSERT INTO "ProductPriceBracket" (product_id, width_mm_max, height_mm_max, base_price_czk, sort_order) VALUES ($1, $2, $3, $4, $5)',
             [pid, w, h, price, sort++]
           );
        }
    }
  }

  console.log("Successfully inserted product 'Horizontální žaluzie Isoline' with price grid and extras!");
  pool.end();
}

run();
