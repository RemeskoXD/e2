import LegalNav from '../components/LegalNav';

/** Šablona obchodních podmínek — před ostrým provozem nechte zkontrolovat právníkem a doplňte IČ, sídlo, rejstřík. */
export default function LegalTerms() {
  return (
    <div className="flex-grow container mx-auto px-6 py-12 max-w-3xl prose prose-neutral">
      <h1 className="text-3xl font-extrabold text-[#132333] mb-2">Obchodní podmínky</h1>
      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6">
        Tento text je <strong>vzorový</strong>. Doplňte identifikační údaje provozovatele, reklamační řád a
        doručovací podmínky podle vaší praxe.
      </p>
      <LegalNav />

      <div className="space-y-6 text-gray-700 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-[#132333]">1. Úvodní ustanovení</h2>
          <p>
            Tyto obchodní podmínky upravují vztah mezi prodávajícím a kupujícím při nákupu zboží nebo služeb
            prostřednictvím internetového obchodu provozovaného pod značkou Qapi.
          </p>
          <p>
            <strong>Provozovatel:</strong> Ropemi s.r.o., IČO 22333941, DIČ CZ22333941, sídlo Varšavská
            715/36, Vinohrady, 120 00 Praha 2 (údaje sladěné se stránkou Kontakt — případně doplňte zápis v
            rejstříku).
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-[#132333]">2. Objednávka a uzavření smlouvy</h2>
          <p>
            Objednávka odeslaná přes formulář v e-shopu je návrhem kupní smlouvy. Smlouva je uzavřena
            potvrzením objednávky ze strany prodávajícího (e-mailem nebo jiným srozumitelným způsobem).
            Ceny uvedené u zboží jsou v českých korunách vč. DPH, pokud není uvedeno jinak.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-[#132333]">3. Platební podmínky a dodání</h2>
          <p>
            Způsob platby a dodání upřesní prodávající po přijetí objednávky. U zboží na míru mohou být
            požadována záloha.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-[#132333]">4. Odstoupení od smlouvy</h2>
          <p>
            Spotřebitel má právo odstoupit od smlouvy ve lhůtě 14 dnů od převzetí zboží, pokud to zákon u
            daného typu zboží připouští. U zboží vyrobeného na zakázku mohou platit výjimky — upřesněte v
            souladu s občanským zákoníkem. K podání odstoupení můžete použít{' '}
            <a href="#/odstoupeni" className="text-[#CCAD8A] font-semibold underline">
              vzorový formulář (e-mail)
            </a>
            .
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-[#132333]">5. Reklamace</h2>
          <p>
            Reklamace se řídí platnými právními předpisy ČR. Kontakt pro reklamace doplňte (e-mail, adresa).
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-[#132333]">6. Závěrečná ustanovení</h2>
          <p>
            Provozovatel si vyhrazuje právo obchodní podmínky měnit; zveřejněná verze je platná v době
            odeslání objednávky, pokud není dohodnuto jinak.
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
