import LegalNav from '../components/LegalNav';

/** Stručné informace o cookies — doplňte podle skutečně používaných nástrojů (analytics, remarketing). */
export default function LegalCookies() {
  return (
    <div className="flex-grow container mx-auto px-6 py-12 max-w-3xl">
      <h1 className="text-3xl font-extrabold text-[#132333] mb-2">Nastavení cookies</h1>
      <p className="text-sm text-gray-500 mb-6">
        Tento web používá cookies a podobné technologie v nezbytném rozsahu pro fungování e-shopu (např.
        košík uložený v prohlížeči u vás na zařízení).
      </p>
      <LegalNav />

      <div className="space-y-6 text-gray-700 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-[#132333]">Nezbytné</h2>
          <p>
            Technicky nutné soubory pro navigaci a dokončení objednávky. Tyto nelze vypnout bez ztráty
            funkčnosti košíku.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-[#132333]">Analytika a marketing</h2>
          <p>
            Pokud v budoucnu nasadíte měřící nástroje (Google Analytics apod.), doplňte zde jejich seznam,
            účel a odkaz na správce. Do té doby tyto cookies aktivně nenastavujeme v tomto šablonovém
            projektu.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-[#132333]">Správa v prohlížeči</h2>
          <p>
            Cookies můžete mazat nebo blokovat v nastavení svého prohlížeče. Blokování nezbytných cookies
            může znemožnit objednávku.
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
