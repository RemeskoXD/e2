import LegalNav from '../components/LegalNav';

/** Informace o zpracování osobních údajů (GDPR) — šablona k doplnění správcem údajů. */
export default function LegalPrivacy() {
  return (
    <div className="flex-grow container mx-auto px-6 py-12 max-w-3xl">
      <h1 className="text-3xl font-extrabold text-[#132333] mb-2">Ochrana osobních údajů</h1>
      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6">
        Dokument doplňte o účely zpracování v plném rozsahu, dobu uchování a případného pověřence. Kontakt
        pro dotazy: <a href="mailto:info@qapi.cz">info@qapi.cz</a>. Při nejasnostech konzultujte právníka.
      </p>
      <LegalNav />

      <div className="space-y-6 text-gray-700 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-[#132333]">Správce osobních údajů</h2>
          <p>
            Správcem je <strong>Ropemi s.r.o.</strong>, IČO 22333941, sídlo Varšavská 715/36, 120 00 Praha 2
            (provoz značky Qapi). Pro uplatnění práv v oblasti osobních údajů použijte e-mail{' '}
            <a href="mailto:info@qapi.cz" className="text-[#CCAD8A] font-semibold">
              info@qapi.cz
            </a>
            .
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-[#132333]">Jaké údaje zpracováváme</h2>
          <p>
            Při objednávce zpracováváme zejména jméno, e-mail, telefon, dodací údaje, obsah objednávky a
            případnou komunikaci. Technické údaje (logy serveru) mohou obsahovat IP adresu v nezbytném
            rozsahu pro bezpečnost provozu.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-[#132333]">Účel a právní základ</h2>
          <p>
            Údaje zpracováváme pro vyřízení objednávky a plnění smlouvy, splnění právních povinností a
            oprávněné zájmy (např. ochrana před zneužitím). Marketing pouze na základě souhlasu, pokud ho
            budete v budoucnu vybírat.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-[#132333]">Doba uchování</h2>
          <p>
            Údaje uchováváme po dobu nezbytnou pro vyřízení objednávky a dle požadavků účetních a daňových
            předpisů (typicky 3–10 let u účetních dokladů).
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-[#132333]">Vaše práva</h2>
          <p>
            Máte právo na přístup k údajům, opravu, výmaz, omezení zpracování, přenositelnost a námitku u
            zpracování z oprávněného zájmu. Můžete podat stížnost u Úřadu pro ochranu osobních údajů.
          </p>
        </section>
      </div>

      <p className="mt-10 text-sm">
        <a href="#/" className="text-[#CCAD8A] font-bold">
          Zpět na úvod
        </a>
      </p>
    </div>
  );
}
