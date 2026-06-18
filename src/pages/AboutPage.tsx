import { Award, MapPin, Ruler, Shield, Sparkles, Wrench } from 'lucide-react';

/** Texty inspirované veřejným webem https://qapi.cz/ — upravené pro kontext tohoto e-shopu (stínění na míru). */
export default function AboutPage() {
  return (
    <div className="flex-grow bg-[#F6F8F9]">
      <div className="container mx-auto px-6 py-12 md:py-16 max-w-4xl">
        <nav className="text-sm text-gray-500 mb-8">
          <a href="#/" className="hover:text-[#CCAD8A]">
            Domů
          </a>
          <span className="mx-2 text-gray-300">/</span>
          <span className="text-[#132333] font-medium">O nás</span>
        </nav>

        <p className="text-xs font-bold tracking-[0.2em] text-[#CCAD8A] uppercase mb-3">Qapi</p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-[#132333] tracking-tight mb-4">
          Nekompromisní kvalita bez výmluv
        </h1>
        <p className="text-lg text-gray-600 leading-relaxed mb-10 max-w-3xl">
          Jsme tým, který dlouhodobě řeší <strong>domácí komfort</strong> — od servisu oken a kování přes{' '}
          <strong>stínicí techniku</strong> až po <strong>garážová vrata</strong>. Tento e-shop jsme postavili
          proto, abyste si mohli pohodlně nakonfigurovat stínění a doplňky na míru s jasnými pravidly měření a
          transparentní kalkulací. Stejný důraz na přesnost a férové jednání, který znáte z naší práce v terénu,
          platí i tady.
        </p>

        <div className="grid md:grid-cols-2 gap-6 mb-14">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-[#CCAD8A]/15 text-[#132333] flex items-center justify-center mb-4">
              <Ruler size={22} />
            </div>
            <h2 className="text-lg font-bold text-[#132333] mb-2">Milimetrová přesnost</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Každý produkt na míru stojí na správném zaměření. Proto u nás najdete srozumitelné návody a můžete se
              spolehnout na to, že řešení stavíme tak, aby sedělo už při první montáži — stejně jako u našich
              realizací v celé ČR.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-[#CCAD8A]/15 text-[#132333] flex items-center justify-center mb-4">
              <Shield size={22} />
            </div>
            <h2 className="text-lg font-bold text-[#132333] mb-2">Bezpečí a soukromí</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Stínění není jen o vzhledu — chrání interiér před přehříváním, hlukem z ulice i zraky sousedů. U vrat a
              technických prvků klademe důraz na spolehlivost a dlouhou životnost.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-[#CCAD8A]/15 text-[#132333] flex items-center justify-center mb-4">
              <Sparkles size={22} />
            </div>
            <h2 className="text-lg font-bold text-[#132333] mb-2">Materiály, které vydrží</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Pracujeme s prověřenými systémy a komponenty od renomovaných výrobců — stejně jako při servisu oken a
              montážích, kde se projeví každý detail.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-[#CCAD8A]/15 text-[#132333] flex items-center justify-center mb-4">
              <Award size={22} />
            </div>
            <h2 className="text-lg font-bold text-[#132333] mb-2">Zákazník na prvním místě</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Zakládáme si na srozumitelné komunikaci a rychlé reakci. Objednávku v e-shopu vždy projdeme a v
              případě nejasností se ozveme — chceme, aby výsledek odpovídal vašim očekáváním.
            </p>
          </div>
        </div>

        <div className="bg-[#132333] text-white rounded-2xl p-8 md:p-10 mb-12">
          <div className="flex items-start gap-4 mb-4">
            <Wrench className="text-[#CCAD8A] shrink-0 mt-1" size={24} />
            <div>
              <h2 className="text-xl font-bold mb-2">E-shop a servis pod jednou střechou</h2>
              <p className="text-gray-300 text-sm leading-relaxed">
                Na webu <span className="text-[#CCAD8A] font-semibold">qapi.cz</span> najdete kompletní přehled
                služeb — záchranu a seřízení oken, stínicí techniku, garážová vrata, sítě proti hmyzu a další. Tento
                obchod rozšiřuje nabídku o pohodlný výběr konfigurovatelných produktů s doručením a podporou při
                měření. Jsme tu pro vás od prvního dotazu až po hotovou realizaci.
              </p>
            </div>
          </div>
          <a
            href="https://qapi.cz/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[#CCAD8A] font-bold text-sm hover:underline mt-2"
          >
            Přejít na hlavní web Qapi →
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-sm text-gray-600 border-t border-gray-200 pt-10">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-[#CCAD8A]" />
            <span>
              <strong className="text-[#132333]">Působíme po celé České republice</strong> — montáž, servis i
              dodávky řešíme s ohledem na vaši lokalitu.
            </span>
          </div>
        </div>

        <p className="mt-10 text-center">
          <a href="#/kontakt" className="text-[#CCAD8A] font-bold hover:underline">
            Kontakt a firemní údaje
          </a>
          <span className="text-gray-400 mx-3">·</span>
          <a href="#/kategorie" className="text-[#CCAD8A] font-bold hover:underline">
            Prohlédnout katalog
          </a>
        </p>
      </div>
    </div>
  );
}
