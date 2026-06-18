import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  sanitizeGuideHtml,
  videoUrlToEmbed,
  type MeasureGuidePageDto,
  type MeasureGuideSectionDto,
} from '../lib/measureGuide';

const FALLBACK_PAGE: MeasureGuidePageDto = {
  id: 1,
  eyebrow: 'MĚŘENÍ A PŘÍPRAVA',
  title: 'Jak zaměřit před objednávkou',
  intro: 'Přesný postup pro čistý montážní otvor.',
  card_title: 'Krok za krokem (přehled)',
  card_subtitle:
    'Stejný princip platí pro rolety, žaluzie i vrata — liší se jen detaily u těsnění a vedení kabelů.',
};

export default function MeasureGuidePage() {
  const [page, setPage] = useState<MeasureGuidePageDto>(FALLBACK_PAGE);
  const [sections, setSections] = useState<MeasureGuideSectionDto[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/measure-guide');
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setLoadError(typeof data?.error === 'string' ? data.error : 'Obsah se nepodařilo načíst.');
          return;
        }
        if (!cancelled && data.page) setPage(data.page as MeasureGuidePageDto);
        if (!cancelled && Array.isArray(data.sections)) setSections(data.sections as MeasureGuideSectionDto[]);
      } catch {
        if (!cancelled) setLoadError('Nelze se spojit se serverem.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (id: number) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex-grow bg-[#F2EFE9]">
      <div className="container mx-auto px-6 py-10 md:py-14 max-w-3xl">
        <nav className="text-sm text-gray-500 mb-6">
          <a href="#/" className="hover:text-[#CCAD8A]">
            Domů
          </a>
          <span className="mx-2 text-gray-400">/</span>
          <span className="text-[#132333] font-medium">Jak zaměřit</span>
        </nav>

        {loadError && (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6">
            {loadError} Zobrazujeme výchozí texty — po spuštění databáze se načte obsah z administrace.
          </p>
        )}

        <p className="text-xs font-bold tracking-[0.2em] text-gray-500 uppercase mb-2">{page.eyebrow}</p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-[#132333] tracking-tight mb-3">
          {page.title}
        </h1>
        <p className="text-gray-600 text-base mb-10 leading-relaxed">{page.intro}</p>

        <div className="bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.06)] border border-gray-100/80 p-6 md:p-10">
          <h2 className="text-xl font-bold text-[#132333] mb-1">{page.card_title}</h2>
          <p className="text-sm text-gray-500 mb-8 leading-relaxed">{page.card_subtitle}</p>

          <div className="space-y-3">
            {sections.map((sec) => {
              const isOpen = openId === sec.id;
              const embed = sec.video_url ? videoUrlToEmbed(sec.video_url) : null;
              return (
                <div
                  key={sec.id}
                  className="rounded-xl border border-gray-200 bg-white overflow-hidden transition-shadow"
                >
                  <button
                    type="button"
                    onClick={() => toggle(sec.id)}
                    className="w-full flex items-center justify-between gap-4 text-left px-4 py-4 md:px-5 hover:bg-gray-50/80 transition-colors"
                  >
                    <span className="font-semibold text-[#132333]">{sec.title}</span>
                    <span className="flex items-center gap-2 shrink-0 text-xs text-gray-400">
                      <span className="hidden sm:inline">(kliknutím rozbalíte)</span>
                      <ChevronDown
                        size={20}
                        className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-5 md:px-5 border-t border-gray-100 pt-4 space-y-4">
                      <div
                        className="tiptap max-w-none text-gray-700 [&_iframe]:max-w-full [&_iframe]:aspect-video [&_iframe]:w-full [&_iframe]:rounded-lg"
                        dangerouslySetInnerHTML={{ __html: sanitizeGuideHtml(sec.body_html) }}
                      />
                      {embed && (
                        <div className="rounded-lg overflow-hidden border border-gray-200 aspect-video bg-black/5">
                          <iframe
                            title={`Video — ${sec.title}`}
                            src={embed}
                            className="w-full h-full min-h-[200px]"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {sections.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">
              Zatím nejsou žádné sekce. Přidejte je v administraci (Jak zaměřit).
            </p>
          )}
        </div>

        <p className="mt-10 text-center text-sm">
          <a href="#/kontakt" className="text-[#CCAD8A] font-bold hover:underline">
            Potřebujete pomoct s měřením? Kontakt
          </a>
        </p>
      </div>
    </div>
  );
}
