import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, ChevronRight, Grid3x3, LayoutGrid, Search, SlidersHorizontal, Eye, X, Star } from 'lucide-react';
import { computeDisplayPriceCzk, formatCzk, toMoneyNumber } from '../lib/money';
import { Helmet } from 'react-helmet-async';

type SortKey = 'recommended' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc';

type ApiCategory = {
  id?: number;
  name: string;
  count: string;
  img: string;
};

type Product = {
  id: number;
  title: string;
  category: string;
  price: number;
  oldPrice?: number;
  badge?: string;
  in_stock?: boolean;
  is_action?: boolean;
  img: string;
  desc: string;
  supplier_markup_percent?: number;
  commission_percent?: number;
  display_price?: number;
  old_display_price?: number;
  review_count?: number;
  avg_rating?: number;
};

function readParams(): { cat: string; q: string; sort: SortKey; page: number; minPrice: number | ''; maxPrice: number | '' } {
  const hash = window.location.hash || '#/kategorie';
  const qPart = hash.includes('?') ? hash.split('?')[1] : '';
  const sp = new URLSearchParams(qPart);
  const sortRaw = sp.get('sort') || '';
  const sortAllowed: SortKey[] = ['recommended', 'price_asc', 'price_desc', 'name_asc', 'name_desc'];
  const sort = sortAllowed.includes(sortRaw as SortKey) ? (sortRaw as SortKey) : 'recommended';
  
  const pageRaw = parseInt(sp.get('page') || '1', 10);
  const page = isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
  
  const minP = parseFloat(sp.get('minP') || '');
  const maxP = parseFloat(sp.get('maxP') || '');

  return {
    cat: sp.get('cat')?.trim() || '',
    q: sp.get('q')?.trim() || '',
    sort,
    page,
    minPrice: isNaN(minP) ? '' : minP,
    maxPrice: isNaN(maxP) ? '' : maxP,
  };
}

function writeHash(cat: string, q: string, sort: SortKey, page: number, minPrice: number | '', maxPrice: number | '') {
  const sp = new URLSearchParams();
  if (cat) sp.set('cat', cat);
  if (q) sp.set('q', q);
  if (sort !== 'recommended') sp.set('sort', sort);
  if (page > 1) sp.set('page', String(page));
  if (minPrice !== '') sp.set('minP', String(minPrice));
  if (maxPrice !== '') sp.set('maxP', String(maxPrice));
  const qs = sp.toString();
  const next = qs ? `#/kategorie?${qs}` : '#/kategorie';
  if (window.location.hash !== next) {
    window.location.hash = next;
  }
}

function matchesCategory(product: Product, catName: string): boolean {
  if (!catName) return true;
  const p = (product.category || '').trim().toLowerCase();
  const c = catName.trim().toLowerCase();
  return p === c || p.includes(c);
}

export default function CategoryShop() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [catFilter, setCatFilter] = useState(readParams().cat);
  const [searchQuery, setSearchQuery] = useState(readParams().q);
  const [sortKey, setSortKey] = useState<SortKey>(readParams().sort);
  const [page, setPage] = useState<number>(readParams().page);
  const [minPrice, setMinPrice] = useState<number | ''>(readParams().minPrice);
  const [maxPrice, setMaxPrice] = useState<number | ''>(readParams().maxPrice);
  const [searchDraft, setSearchDraft] = useState(readParams().q);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);

  const pageSize = 12;

  const syncFromHash = useCallback(() => {
    const p = readParams();
    setCatFilter(p.cat);
    setSearchQuery(p.q);
    setSearchDraft(p.q);
    setSortKey(p.sort);
    setPage(p.page);
    setMinPrice(p.minPrice);
    setMaxPrice(p.maxPrice);
  }, []);

  useEffect(() => {
    const onHash = () => syncFromHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [syncFromHash]);

  useEffect(() => {
    const load = async () => {
      setError(null);
      try {
        const [pr, cr] = await Promise.all([fetch('/api/products'), fetch('/api/categories')]);
        const pdata = await pr.json();
        const cdata = await cr.json();
        if (!pr.ok) {
          setProducts([]);
          setError(typeof pdata?.error === 'string' ? pdata.error : 'Produkty se nepodařilo načíst.');
        } else {
          setProducts(Array.isArray(pdata) ? (pdata as Product[]) : []);
        }
        if (cr.ok && Array.isArray(cdata)) {
          setCategories(cdata.filter((c: ApiCategory) => c && c.name));
        } else {
          setCategories([]);
        }
      } catch {
        setProducts([]);
        setCategories([]);
        setError('Nelze se spojit se serverem.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const customerPrice = useCallback(
    (p: Product) =>
      p.display_price != null && Number.isFinite(p.display_price)
        ? p.display_price
        : computeDisplayPriceCzk(
            p.price,
            toMoneyNumber(p.supplier_markup_percent),
            toMoneyNumber(p.commission_percent)
          ),
    []
  );

  const countsByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) {
      const key = (p.category || 'Ostatní').trim() || 'Ostatní';
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [products]);

  const filtered = useMemo(() => {
    let list = products.filter((p) => matchesCategory(p, catFilter));
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const t = `${p.title} ${p.desc} ${p.category}`.toLowerCase();
        return t.includes(q);
      });
    }
    if (minPrice !== '') {
      list = list.filter(p => customerPrice(p) >= Number(minPrice));
    }
    if (maxPrice !== '') {
      list = list.filter(p => customerPrice(p) <= Number(maxPrice));
    }
    const sorted = [...list];
    switch (sortKey) {
      case 'price_asc':
        sorted.sort((a, b) => customerPrice(a) - customerPrice(b));
        break;
      case 'price_desc':
        sorted.sort((a, b) => customerPrice(b) - customerPrice(a));
        break;
      case 'name_asc':
        sorted.sort((a, b) => a.title.localeCompare(b.title, 'cs'));
        break;
      case 'name_desc':
        sorted.sort((a, b) => b.title.localeCompare(a.title, 'cs'));
        break;
      default:
        sorted.sort((a, b) => b.id - a.id); // reverse ID recommended
    }
    return sorted;
  }, [products, catFilter, searchQuery, sortKey, customerPrice, minPrice, maxPrice]);

  const maxPage = Math.max(1, Math.ceil(filtered.length / pageSize));
  
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const applyFilters = (patch: Partial<{ cat: string; q: string; sort: SortKey; page: number; minPrice: number | ''; maxPrice: number | '' }>) => {
    const cat = patch.cat !== undefined ? patch.cat : catFilter;
    const q = patch.q !== undefined ? patch.q : searchQuery;
    const sort = patch.sort !== undefined ? patch.sort : sortKey;
    const pPage = patch.page !== undefined ? patch.page : page;
    const pMin = patch.minPrice !== undefined ? patch.minPrice : minPrice;
    const pMax = patch.maxPrice !== undefined ? patch.maxPrice : maxPrice;
    setCatFilter(cat);
    setSearchQuery(q);
    setSortKey(sort);
    setPage(pPage);
    setMinPrice(pMin);
    setMaxPrice(pMax);
    writeHash(cat, q, sort, pPage, pMin, pMax);
  };

  const onSelectCategory = (name: string) => {
    applyFilters({ cat: name, page: 1 });
    setMobileFiltersOpen(false);
  };

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    applyFilters({ q: searchDraft.trim(), page: 1 });
  };

  const totalLabel = catFilter ? catFilter : 'Kompletní nabídka';
  const activeCategoryMeta = categories.find((c) => c.name === catFilter);

  if (loading) {
    return (
      <div className="flex-grow min-h-[50vh] flex items-center justify-center text-gray-500">
        <div className="flex flex-col items-center gap-3">
          <LayoutGrid className="animate-pulse text-[#CCAD8A]" size={40} />
          Načítám katalog…
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow bg-[#F0F2F4]">
      <Helmet>
        <title>{catFilter ? `${catFilter} | Kategorie | Qapi.cz` : 'Katalog produktů | Qapi.cz'}</title>
        <meta name="description" content={`Prozkoumejte naše kvalitní produkty. ${catFilter ? `Kategorie: ${catFilter}` : 'Všechna nabídka na jednom místě.'}`} />
      </Helmet>
      <div className="container mx-auto px-4 md:px-6 py-8 md:py-10">
        <nav className="text-sm text-gray-500 mb-6 flex flex-wrap items-center gap-1">
          <a href="#/" className="hover:text-[#CCAD8A]">
            Domů
          </a>
          <ChevronRight size={14} className="text-gray-300" />
          <span className="text-[#132333] font-medium">Kategorie</span>
          {catFilter && (
            <>
              <ChevronRight size={14} className="text-gray-300" />
              <span className="text-[#132333] font-medium truncate max-w-[200px]">{catFilter}</span>
            </>
          )}
        </nav>

        <div className="flex flex-col xl:flex-row gap-8 xl:gap-10">
          {/* Sidebar — desktop */}
          <aside className="hidden xl:block w-72 shrink-0 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden sticky top-36">
              <div className="px-5 py-4 border-b border-gray-100 bg-[#132333] text-white">
                <h2 className="font-bold flex items-center gap-2">
                  <Grid3x3 size={18} className="text-[#CCAD8A]" />
                  Kategorie a filtry
                </h2>
                <p className="text-xs text-white/70 mt-1">Vyfiltrujte sortiment podle typu produktu.</p>
              </div>
              <div className="p-2 max-h-[calc(100vh-220px)] overflow-y-auto">
                <button
                  type="button"
                  onClick={() => onSelectCategory('')}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-colors flex justify-between items-center gap-2 ${
                    !catFilter ? 'bg-[#CCAD8A]/20 text-[#132333]' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>Všechny produkty</span>
                  <span className="text-xs text-gray-500 font-bold tabular-nums">{products.length}</span>
                </button>
                {categories.map((c, idx) => {
                  const n = countsByCategory.get(c.name) ?? 0;
                  const active = catFilter === c.name;
                  return (
                    <button
                      key={c.id ?? idx}
                      type="button"
                      onClick={() => onSelectCategory(c.name)}
                      className={`w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-colors flex justify-between items-center gap-2 ${
                        active ? 'bg-[#CCAD8A]/20 text-[#132333]' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="text-xs text-gray-500 font-bold tabular-nums shrink-0">{n}</span>
                    </button>
                  );
                })}

                <div className="mt-4 px-4 pt-4 border-t border-gray-100">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Cena (Kč)</h3>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="number"
                      placeholder="Od"
                      value={minPrice === '' ? '' : minPrice}
                      onChange={(e) => applyFilters({ minPrice: e.target.value ? Number(e.target.value) : '' })}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-[#CCAD8A]"
                    />
                    <span className="text-gray-400">-</span>
                    <input
                      type="number"
                      placeholder="Do"
                      value={maxPrice === '' ? '' : maxPrice}
                      onChange={(e) => applyFilters({ maxPrice: e.target.value ? Number(e.target.value) : '' })}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-[#CCAD8A]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <main className="flex-1 min-w-0">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8 mb-6">
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                  <p className="text-xs font-bold tracking-widest text-[#CCAD8A] uppercase mb-2">E-shop Qapi</p>
                  <h1 className="text-2xl md:text-3xl font-extrabold text-[#132333] tracking-tight">
                    {totalLabel}
                  </h1>
                  <p className="text-gray-500 mt-2 max-w-2xl text-sm md:text-base">
                    Vyberte produkt, zadejte rozměry v milimetrech — cena se dopočítá z aktuálního ceníku. Filtrujte
                    podle kategorie, vyhledejte podle názvu nebo seřaďte podle ceny.
                  </p>
                </div>
                <div className="text-sm text-gray-600 md:text-right">
                  <span className="font-black text-2xl text-[#132333] tabular-nums">{filtered.length}</span>
                  <span className="text-gray-500 ml-1">
                    {filtered.length === 1 ? 'produkt' : filtered.length < 5 ? 'produkty' : 'produktů'}
                  </span>
                </div>
              </div>

              {activeCategoryMeta?.img && (
                <div className="mt-6 h-36 md:h-44 rounded-xl overflow-hidden relative">
                  <img
                    src={activeCategoryMeta.img}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#132333]/80 to-transparent" />
                  <p className="absolute bottom-3 left-4 text-white/90 text-sm font-medium max-w-lg line-clamp-2">
                    {activeCategoryMeta.count}
                  </p>
                </div>
              )}
            </div>

            {/* Mobile category chips + filter toggle */}
            <div className="xl:hidden mb-4 space-y-3">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen((v) => !v)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 bg-white font-bold text-[#132333] text-sm"
              >
                <SlidersHorizontal size={18} />
                {mobileFiltersOpen ? 'Skrýt kategorie' : 'Kategorie a filtry'}
              </button>
              {mobileFiltersOpen && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden p-3 mt-2">
                  <div className="flex flex-wrap gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => onSelectCategory('')}
                      className={`px-3 py-2 rounded-lg text-xs font-bold ${
                        !catFilter ? 'bg-[#132333] text-white' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      Všechny ({products.length})
                    </button>
                    {categories.map((c, idx) => {
                      const n = countsByCategory.get(c.name) ?? 0;
                      const active = catFilter === c.name;
                      return (
                        <button
                          key={c.id ?? idx}
                          type="button"
                          onClick={() => onSelectCategory(c.name)}
                          className={`px-3 py-2 rounded-lg text-xs font-bold max-w-[200px] truncate ${
                            active ? 'bg-[#132333] text-white' : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {c.name} ({n})
                        </button>
                      );
                    })}
                  </div>
                  <div className="border-t border-gray-100 pt-3">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Cena (Kč)</h3>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        placeholder="Od"
                        value={minPrice === '' ? '' : minPrice}
                        onChange={(e) => applyFilters({ minPrice: e.target.value ? Number(e.target.value) : '' })}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-[#CCAD8A]"
                      />
                      <span className="text-gray-400">-</span>
                      <input
                        type="number"
                        placeholder="Do"
                        value={maxPrice === '' ? '' : maxPrice}
                        onChange={(e) => applyFilters({ maxPrice: e.target.value ? Number(e.target.value) : '' })}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-[#CCAD8A]"
                      />
                    </div>
                  </div>
                </div>
              )}
              {!mobileFiltersOpen && (
                <div className="flex gap-2 overflow-x-auto hide-scroll-bar pb-1 -mx-1 px-1">
                  <button
                    type="button"
                    onClick={() => onSelectCategory('')}
                    className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold border ${
                      !catFilter ? 'border-[#132333] bg-[#132333] text-white' : 'border-gray-200 bg-white text-gray-700'
                    }`}
                  >
                    Všechny
                  </button>
                  {categories.slice(0, 8).map((c, idx) => {
                    const active = catFilter === c.name;
                    return (
                      <button
                        key={c.id ?? idx}
                        type="button"
                        onClick={() => onSelectCategory(c.name)}
                        className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold border truncate max-w-[160px] ${
                          active ? 'border-[#132333] bg-[#132333] text-white' : 'border-gray-200 bg-white text-gray-700'
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <form onSubmit={submitSearch} className="flex-1 flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    placeholder="Hledat v názvu a popisu…"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-[#CCAD8A] focus:border-transparent outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="px-5 py-3 rounded-xl bg-[#132333] text-white text-sm font-bold shrink-0"
                >
                  Hledat
                </button>
              </form>
              <div className="sm:w-56">
                <label className="sr-only" htmlFor="sort-katalog">
                  Řazení
                </label>
                <select
                  id="sort-katalog"
                  value={sortKey}
                  onChange={(e) => applyFilters({ sort: e.target.value as SortKey })}
                  className="w-full py-3 px-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-[#132333] focus:ring-2 focus:ring-[#CCAD8A] outline-none"
                >
                  <option value="recommended">Doporučené (výchozí)</option>
                  <option value="price_asc">Cena: od nejnižší</option>
                  <option value="price_desc">Cena: od nejvyšší</option>
                  <option value="name_asc">Název A → Z</option>
                  <option value="name_desc">Název Z → A</option>
                </select>
              </div>
            </div>

            {searchQuery && (
              <p className="text-sm text-gray-600 mb-4">
                Hledání: „<strong>{searchQuery}</strong>“
                <button
                  type="button"
                  onClick={() => {
                    setSearchDraft('');
                    applyFilters({ q: '' });
                  }}
                  className="ml-2 text-[#CCAD8A] font-bold hover:underline"
                >
                  Zrušit
                </button>
              </p>
            )}

            {error && (
              <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}

            {!error && filtered.length === 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center">
                <p className="text-gray-600 mb-4">
                  {products.length === 0
                    ? 'V katalogu zatím nejsou žádné produkty.'
                    : 'Žádný produkt nevyhovuje filtru. Zkuste jinou kategorii nebo hledaný výraz.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchDraft('');
                    applyFilters({ cat: '', q: '', sort: 'recommended' });
                  }}
                  className="text-[#CCAD8A] font-bold hover:underline"
                >
                  Zrušit všechny filtry
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {paginated.map((p) => (
                <a
                  key={p.id}
                  href={`#/produkt/${p.id}`}
                  className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-[#CCAD8A]/40 transition-all overflow-hidden flex flex-col"
                >
                  <div className="h-52 bg-gray-100 overflow-hidden relative">
                    <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-1">
                      {p.is_action && (
                        <span className="text-[10px] font-bold px-2 py-1 rounded uppercase bg-[#E53935] text-white">
                          AKCE
                        </span>
                      )}
                      {p.in_stock && (
                        <span className="text-[10px] font-bold px-2 py-1 rounded uppercase bg-green-600 text-white">
                          Skladem
                        </span>
                      )}
                      {p.badge && p.badge !== 'Akce' && p.badge !== 'Skladem' && p.badge !== 'AKCE' && (
                        <span className="text-[10px] font-bold px-2 py-1 rounded uppercase bg-[#CCAD8A] text-[#132333]">
                          {p.badge}
                        </span>
                      )}
                    </div>
                    <img
                      src={p.img}
                      alt={p.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  <div className="p-5 flex flex-col flex-grow">
                    <span className="text-[11px] text-[#CCAD8A] uppercase tracking-widest font-bold mb-1">
                      {p.category}
                    </span>
                    <h2 className="text-lg font-bold text-[#132333] mb-2 line-clamp-2 group-hover:text-[#CCAD8A] transition-colors">
                      {p.title}
                    </h2>
                    
                    {(p.review_count ?? 0) > 0 && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="flex text-yellow-400">
                          <Star className="fill-current w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold text-gray-900">
                          {p.avg_rating ? p.avg_rating.toFixed(1) : '5.0'}
                        </span>
                        <span className="text-[10px] text-gray-500">({p.review_count})</span>
                      </div>
                    )}

                    <p className="text-sm text-gray-500 line-clamp-2 mb-4 flex-grow">
                      {p.desc ? p.desc.replace(/<[^>]+>/g, '') : ''}
                    </p>
                    <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-50">
                      <div>
                        <span className="text-lg font-black text-[#132333]">
                          od {formatCzk(customerPrice(p))} Kč
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); setQuickViewProduct(p); }}
                          className="p-2 text-gray-400 hover:text-[#CCAD8A] hover:bg-[#CCAD8A]/10 rounded-full transition-colors"
                          title="Rychlý náhled"
                        >
                          <Eye size={20} />
                        </button>
                        <span className="bg-green-500 hover:bg-green-600 active:bg-green-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-1 text-sm transition-colors shadow-sm">
                          Konfigurovat
                        </span>
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>

            {maxPage > 1 && (
              <div className="mt-8 flex justify-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => {
                    applyFilters({ page: page - 1 });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-4 py-2 border border-gray-200 rounded-xl bg-white text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                >
                  Předchozí
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: maxPage }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        applyFilters({ page: i + 1 });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`w-10 h-10 rounded-xl border text-sm font-bold flex items-center justify-center transition-colors ${
                        page === i + 1 ? 'border-[#132333] bg-[#132333] text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <button
                  disabled={page >= maxPage}
                  onClick={() => {
                    applyFilters({ page: page + 1 });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-4 py-2 border border-gray-200 rounded-xl bg-white text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                >
                  Další
                </button>
              </div>
            )}
          </main>
        </div>
      </div>
      {quickViewProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setQuickViewProduct(null)}
              className="absolute top-4 right-4 z-10 w-10 h-10 bg-black/10 hover:bg-black/20 text-white rounded-full flex items-center justify-center transition-colors backdrop-blur-md"
            >
              <X size={20} />
            </button>
            <div className="flex flex-col md:flex-row max-h-[90vh]">
              <div className="w-full md:w-1/2 h-64 md:h-auto bg-gray-100 relative">
                <img src={quickViewProduct.img} alt={quickViewProduct.title} className="w-full h-full object-cover" />
              </div>
              <div className="w-full md:w-1/2 p-8 md:p-10 flex flex-col overflow-y-auto">
                <span className="text-xs font-bold tracking-widest text-[#CCAD8A] uppercase mb-2">
                  {quickViewProduct.category}
                </span>
                <h2 className="text-2xl md:text-3xl font-extrabold text-[#132333] mb-4">
                  {quickViewProduct.title}
                </h2>
                <div 
                  className="prose prose-sm text-gray-500 mb-8 flex-grow"
                  dangerouslySetInnerHTML={{ __html: quickViewProduct.desc }}
                />
                <div className="mt-auto pt-6 border-t border-gray-100">
                  <p className="text-sm text-gray-400 mb-1">Základní cena</p>
                  <p className="text-3xl font-black text-[#132333] mb-6">
                    od {formatCzk(customerPrice(quickViewProduct))} Kč
                  </p>
                  <a
                    href={`#/produkt/${quickViewProduct.id}`}
                    className="flex w-full justify-center items-center gap-2 bg-[#CCAD8A] text-[#132333] font-bold py-4 px-8 rounded-xl hover:bg-[#b5997a] transition-colors"
                  >
                    Přejít ke konfiguraci <ArrowRight size={20} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
