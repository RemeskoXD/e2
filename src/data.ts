export const BASE_IMG_URL = "https://web2.itnahodinu.cz/qapieshop/Obrázky";

export const imgUrl = (path: string) => encodeURI(`${BASE_IMG_URL}/${path}`);

export const productsData = [
  {
    id: 1,
    title: "Horizontální žaluzie Euro",
    category: "Interiérové stínění",
    desc: "Klasické hliníkové žaluzie s řetízkovým ovládáním pro přesnou regulaci světla.",
    price: 490,
    oldPrice: 590,
    badge: "Bestseller",
    img: imgUrl("Produktové foto SHADEON/Isoline.jpg")
  },
  {
    id: 2,
    title: "Látkové rolety Den/Noc",
    category: "Interiérové stínění",
    desc: "Záclona i závěs v jednom. Plynulá regulace stínění s nadčasovým designem.",
    price: 1290,
    badge: "Novinka",
    img: imgUrl("Produktové foto SHADEON/textilni_dn_collete.jpg")
  },
  {
    id: 3,
    title: "Venkovní žaluzie Z90",
    category: "Venkovní stínění",
    desc: "Nejúčinnější tepelná izolace s lamelou ve tvaru Z pro dokonalé domykání.",
    price: 5800,
    oldPrice: 6500,
    badge: "Akce",
    img: imgUrl("Produktové foto SHADEON/v-Z90.jpg")
  },
  {
    id: 4,
    title: "Screenové rolety ZIP",
    category: "Venkovní stínění",
    desc: "Extrémní odolnost proti větru, zachování průhledu ven a ochrana soukromí.",
    price: 4200,
    badge: "",
    img: imgUrl("Produktové foto SHADEON/screenova_Tara.jpg")
  },
  {
    id: 5,
    title: "Pevné okenní sítě",
    category: "Sítě proti hmyzu",
    desc: "Neviditelná ochrana proti komárům s elegantním hliníkovým rámem.",
    price: 650,
    badge: "",
    img: imgUrl("Produktové foto SHADEON/balicek_fotografii_Shadeon -na web/pevné sítě proti hmyzu.jpg")
  },
  {
    id: 6,
    title: "Dveřní sítě otevíravé",
    category: "Sítě proti hmyzu",
    desc: "Samozavírací panty a magnetický zámek pro bezstarostný průchod na terasu.",
    price: 1850,
    oldPrice: 2100,
    badge: "Sleva",
    img: imgUrl("Produktové foto SHADEON/balicek_fotografii_Shadeon -na web/rolovací dveřní síť.jpg")
  },
  {
    id: 7,
    title: "Plisé žaluzie na míru",
    category: "Interiérové stínění",
    desc: "Skládaná látka s možností stahování odshora dolů i odspodu nahoru.",
    price: 1550,
    badge: "Bestseller",
    img: imgUrl("Produktové foto SHADEON/balicek_fotografii_Shadeon -na web/plisé žaluzie (1).jpg")
  },
  {
    id: 8,
    title: "Textilní rolety (blackout)",
    category: "Interiérové stínění",
    desc: "Pogumovaná zadní strana pro 100% zatemnění a snížení teploty v místnosti.",
    price: 1100,
    badge: "",
    img: imgUrl("Produktové foto SHADEON/textilni-collete.jpg")
  }
];

export const referencesData = [
  {
    id: 1,
    title: "Moderní dům s terasou",
    stars: 5,
    text: "Screenové rolety Tara nám zachránily jižní terasu před přehříváním. Skvělá komunikace a opravdu rychlá a čistá montáž.",
    location: "Praha - západ",
    tag: "VENKOVNÍ STÍNĚNÍ",
    img: imgUrl("Venkovní stínění/Screenové rolety/tara.jpg"),
    productName: "Screenové rolety"
  },
  {
    id: 2,
    title: "Slunný obývací pokoj",
    stars: 5,
    text: "Klasické žaluzie do oken. Vše sedí na milimetr přesně, barva lamely krásně ladí s naší dřevěnou podlahou. Spokojenost 5/5.",
    location: "Olomouc",
    tag: "INTERIÉR",
    img: imgUrl("Interiérové stínění/Horizontální žaluzie/menu-zaluzie.jpg"),
    productName: "Horizontální žaluzie"
  },
  {
    id: 3,
    title: "Novostavba rodinného domu",
    stars: 5,
    text: "Žaluzie Z90 jsou naprosto perfektní. Dům vypadá velmi moderně a v létě máme uvnitř příjemný chládek i bez použití klimatizace.",
    location: "Vysočina",
    tag: "VENKOVNÍ STÍNĚNÍ",
    img: imgUrl("Produktové foto SHADEON/v-Z90.jpg"),
    productName: "Venkovní žaluzie"
  },
  {
    id: 4,
    title: "Stínění pro zimní zahradu",
    stars: 5,
    text: "Zvolili jsme plisé žaluzie ze slasheru. Velký výběr látek, vybrali jsme zatemňovací a fungují přesně podle našich představ.",
    location: "Kladno",
    tag: "INTERIÉR",
    img: imgUrl("Obrázky/Interiérové stínění/Plisé žaluzie/menu-plise.jpg").replace('Obrázky/', ''),
    productName: "Plisé žaluzie"
  },
  {
    id: 5,
    title: "Ochrana velkých HS portálů",
    stars: 5,
    text: "Posuvné sítě na francouzská okna běhají velmi lehce, síťovina je kvalitní a z dálky téměř neviditelná. Doporučuji.",
    location: "Brno",
    tag: "SÍTĚ PROTI HMYZU",
    img: imgUrl("Produktové foto SHADEON/balicek_fotografii_Shadeon -na web/posuvná síť v rámu.jpg"),
    productName: "Posuvné sítě"
  },
  {
    id: 6,
    title: "Zatemnění ložnice",
    stars: 5,
    text: "Maximální spokojenost. Zvolili jsme rolety den/noc Collete s blackout látkou a konečně nás po ránu nebudí pálící sluníčko.",
    location: "Pardubice",
    tag: "INTERIÉR",
    img: imgUrl("Produktové foto SHADEON/textilni_dn_collete.jpg"),
    productName: "Látkové rolety Den/Noc"
  }
];

export const categoriesData = [
  { 
    name: "Interiérové stínění", 
    count: "Více než 120 variant",
    img: imgUrl("Interiérové stínění/Horizontální žaluzie/menu-zaluzie.jpg")
  },
  { 
    name: "Venkovní stínění", 
    count: "Prémiová ochrana",
    img: imgUrl("Venkovní stínění/Screenové rolety/menu_screeny.jpg")
  },
  { 
    name: "Sítě proti hmyzu", 
    count: "Rámové i rolovací",
    img: imgUrl("Produktové foto SHADEON/balicek_fotografii_Shadeon -na web/pevné sítě proti hmyzu.jpg")
  },
  // { 
  //   name: "Garážová vrata", 
  //   count: "Bezpečí a design",
  //   img: imgUrl("Vrata/rolovaci vrata.png")
  // },
];
