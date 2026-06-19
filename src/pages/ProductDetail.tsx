import { useEffect, useState, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { ShoppingCart, Ruler, Info, Check, AlertCircle, Star, Truck, PackageCheck } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatCzk } from '../lib/money';
import { sanitizeGuideHtml } from '../lib/measureGuide';
import ReviewModal from '../components/ReviewModal';

type Review = {
  id: number;
  author_name: string;
  rating: number;
  text?: string;
  images?: string[];
  created_at: string;
};

type Product = {
  id: number;
  slug?: string;
  title: string;
  category: string;
  price: number;
  img: string;
  desc: string;
  gallery?: string[];
  validation_profile?: string | null;
  dimension_constraints?: {
    width_mm_min: number;
    width_mm_max: number;
    height_mm_min: number;
    height_mm_max: number;
    max_area_m2: number | null;
  } | null;
  colors?: string[] | { name: string; img?: string }[];
  extras?: { id: string; name: string; price: number }[];
  fabric_groups_config?: {
    name: string;
    surcharge?: number;
    surcharge_percent?: number; // legacy
    max_width_mm?: number;
    max_height_mm?: number;
    colors: { name: string; img?: string; max_width_mm?: number; max_height_mm?: number }[];
  }[] | null;
  parameters?: {
    id: string;
    name: string;
    type: 'select' | 'color_array';
    options: { label: string; value: string; colorCode?: string; img?: string; priceVariant?: number; priceType?: 'fixed' | 'per_m2' | 'per_bm' | 'per_bm_height' }[];
    condition?: {
      dependsOnParamId: string;
      allowedValues: string[];
    };
  }[];
};

type QuoteRes = {
  total_czk: number;
  product_title?: string;
  vat_note?: string;
  catalog_warning?: string;
  catalog_note?: string;
  dimension_constraints?: Product['dimension_constraints'];
};

const COMMON_COLORS = [
  { name: 'Bílá', hex: '#ffffff' },
  { name: 'Stříbrná', hex: '#e2e8f0' },
  { name: 'Šedá', hex: '#94a3b8' },
  { name: 'Antracit', hex: '#334155' },
  { name: 'Černá', hex: '#0f172a' },
  { name: 'Hnědá', hex: '#78350f' },
  { name: 'Béžová', hex: '#f5f5dc' },
  { name: 'Slonová kost', hex: '#fffff0' },
];

function getUrlParams() {
  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return new URLSearchParams();
  return new URLSearchParams(hash.slice(queryIndex));
}

export default function ProductDetail({ productId }: { productId: string }) {
  const initialParams = getUrlParams();
  const { addLine } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mainImg, setMainImg] = useState<string | null>(null);
  const [widthMm, setWidthMm] = useState(initialParams.get('w') || '');
  const [heightMm, setHeightMm] = useState(initialParams.get('h') || '');
  const [color, setColor] = useState(initialParams.get('color') || '');
  const [fabric, setFabric] = useState(initialParams.get('fabric') || '');
  const [pliseModel, setPliseModel] = useState(initialParams.get('plise') || 'PM1');
  const [lamela, setLamela] = useState(initialParams.get('lamela') || '39');
  const [polyscreen, setPolyscreen] = useState(initialParams.get('polyscreen') === '1');
  const [bezLatky, setBezLatky] = useState(initialParams.get('bezLatky') === '1');
  const [ral, setRal] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [quote, setQuote] = useState<QuoteRes | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [fabricGroups, setFabricGroups] = useState<any[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedExtras, setSelectedExtras] = useState<string[]>(() => {
    const ex = initialParams.get('extras');
    return ex ? ex.split(',') : [];
  });
  const [selectedParameters, setSelectedParameters] = useState<Record<string, string>>(() => {
    const p: Record<string, string> = {};
    initialParams.forEach((value, key) => {
      if (key.startsWith('p_')) {
        p[key.substring(2)] = value;
      }
    });
    return p;
  });
  const [selectedFabricGroupConfigIndex, setSelectedFabricGroupConfigIndex] = useState<number | null>(() => {
    const val = initialParams.get('fgc');
    return val ? parseInt(val, 10) : null;
  });

  useEffect(() => {
    fetch('/api/fabric-groups')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setFabricGroups(d);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const load = async () => {
      setError(null);
      try {
        const res = await fetch('/api/products');
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) {
          setError('Nepodařilo se načíst produkt.');
          return;
        }
        const p = (data as Product[]).find((x) => x.slug === productId || String(x.id) === productId);
        if (!p) {
          setError('Produkt nenalezen.');
          return;
        }
        setProduct(p);
        const d = p.dimension_constraints;
        if (d && !widthMm && !heightMm) {
          setWidthMm(String(Math.round((d.width_mm_min + d.width_mm_max) / 2)));
          setHeightMm(String(Math.round((d.height_mm_min + d.height_mm_max) / 2)));
        }

        // Fetch reviews
        try {
          setReviewsLoading(true);
          const revRes = await fetch(`/api/products/${p.id}/reviews`);
          if (revRes.ok) {
            const revData = await revRes.json();
            if (Array.isArray(revData)) setReviews(revData);
          }
        } catch (e) {
          console.error("Error fetching reviews:", e);
        } finally {
          setReviewsLoading(false);
        }

      } catch {
        setError('Chyba sítě.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [productId]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (widthMm) params.set('w', widthMm);
    if (heightMm) params.set('h', heightMm);
    if (color) params.set('color', color);
    if (fabric) params.set('fabric', fabric);
    if (pliseModel && pliseModel !== 'PM1') params.set('plise', pliseModel);
    if (lamela && lamela !== '39') params.set('lamela', lamela);
    if (polyscreen) params.set('polyscreen', '1');
    if (bezLatky) params.set('bezLatky', '1');
    if (selectedExtras.length > 0) params.set('extras', selectedExtras.join(','));
    if (selectedFabricGroupConfigIndex !== null) params.set('fgc', selectedFabricGroupConfigIndex.toString());
    Object.entries(selectedParameters).forEach(([k, v]) => {
      if (v) params.set(`p_${k}`, v);
    });

    const hash = window.location.hash;
    const path = hash.split('?')[0];
    const newQuery = params.toString();
    const newHash = newQuery ? `${path}?${newQuery}` : path;
    
    if (newHash !== hash) {
      window.history.replaceState(null, '', newHash);
    }
  }, [widthMm, heightMm, color, fabric, pliseModel, lamela, polyscreen, bezLatky, selectedExtras, selectedFabricGroupConfigIndex, selectedParameters]);

  const visibleParameters = useMemo(() => {
    if (!product?.parameters) return [];
    return product.parameters.filter(param => {
      if (!param.condition) return true;
      const parentVal = selectedParameters[param.condition.dependsOnParamId];
      if (!parentVal) return false;
      return param.condition.allowedValues.includes(parentVal);
    });
  }, [product?.parameters, selectedParameters]);

  useEffect(() => {
    if (!product?.parameters) return;
    const visibleIds = visibleParameters.map(p => p.id);
    let changed = false;
    const newSelected = { ...selectedParameters };
    Object.keys(newSelected).forEach(key => {
      if (product.parameters!.some(p => p.id === key) && !visibleIds.includes(key)) {
        delete newSelected[key];
        changed = true;
      }
    });
    if (changed) {
      setSelectedParameters(newSelected);
    }
  }, [visibleParameters, selectedParameters, product?.parameters]);

  const [selectedFabricColorId, setSelectedFabricColorId] = useState<string | null>(null);
  const [selectedFabricGroupId, setSelectedFabricGroupId] = useState<number | null>(null);

  const buildOptions = (): Record<string, unknown> => {
    const o: Record<string, unknown> = {};
    const prof = product?.validation_profile;
    if (color) {
      o.barva = color;
      o.color = color;
    }
    if (prof === 'plise') {
      o.model = pliseModel;
    }
    if (fabric.trim()) {
      o.fabric = fabric.trim();
      o.latka = fabric.trim();
    }
    if (selectedFabricGroupId) {
      o.fabric_group_id = selectedFabricGroupId;
    }
    if (selectedFabricGroupConfigIndex !== null) {
      o.fabric_group_config_index = selectedFabricGroupConfigIndex;
    }
    if (Object.keys(selectedParameters).length > 0) {
      o.selected_parameters = selectedParameters;
    }
    if (prof === 'venkovni_roleta_radix') {
      o.lamela = lamela.trim() || '39';
    }
    if (selectedExtras.length > 0) {
      o.selected_extras_ids = selectedExtras;
      const dbExtras = product?.extras || [];
      const chosenNames = dbExtras.filter(ex => selectedExtras.includes(ex.id)).map(ex => ex.name);
      if (chosenNames.length > 0) {
        o.priplatkove_polozky = chosenNames.join(', ');
      }
    }
    if (prof === 'screen_roleta_union_l') {
      o.polyscreen = polyscreen;
      o.bez_latky = bezLatky;
      o.without_fabric = bezLatky;
      o.ral = ral;
      o.ral_dolni_profil = ral;
    }
    return o;
  };

  const runQuote = async () => {
    if (!product) return;
    const w = Number(widthMm);
    const h = Number(heightMm);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
      setQuoteError('Zadejte šířku a výšku v mm (kladná čísla).');
      setQuote(null);
      return;
    }

    if (product.dimension_constraints) {
      const dim = product.dimension_constraints;
      if (w < dim.width_mm_min || w > dim.width_mm_max) {
        setQuoteError(`Šířka musí být v rozmezí ${dim.width_mm_min} až ${dim.width_mm_max} mm.`);
        setQuote(null);
        return;
      }
      if (h < dim.height_mm_min || h > dim.height_mm_max) {
        setQuoteError(`Výška musí být v rozmezí ${dim.height_mm_min} až ${dim.height_mm_max} mm.`);
        setQuote(null);
        return;
      }
      if (dim.max_area_m2) {
        const area = (w / 1000) * (h / 1000);
        if (area > dim.max_area_m2) {
          setQuoteError(`Maximální povolená plocha je ${dim.max_area_m2} m² (zadáno ${area.toFixed(2)} m²).`);
          setQuote(null);
          return;
        }
      }
    }

    setQuoting(true);
    setQuoteError(null);
    try {
      const body: Record<string, unknown> = {
        widthMm: w,
        heightMm: h,
        ...buildOptions(),
      };
      const res = await fetch(`/api/products/${product.id}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setQuote(null);
        setQuoteError(typeof data?.error === 'string' ? data.error : 'Výpočet ceny selhal.');
        return;
      }
      setQuote(data as QuoteRes);
    } catch {
      setQuote(null);
      setQuoteError('Nelze spojit se serverem.');
    } finally {
      setQuoting(false);
    }
  };

  useEffect(() => {
    if (!widthMm || !heightMm || !product) return;
    const timer = setTimeout(() => {
      runQuote();
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widthMm, heightMm, color, fabric, pliseModel, lamela, polyscreen, bezLatky, ral, selectedFabricGroupId, selectedFabricGroupConfigIndex, selectedExtras, selectedParameters, product]);

  const handleAddToCart = () => {
    if (!product || !quote?.total_czk) return;
    const w = Math.round(Number(widthMm));
    const h = Math.round(Number(heightMm));
    
    // Validace pro Isoline PRIM
    if (product.title.toLowerCase().includes('isoline prim')) {
      const area = (w * h) / 1000000;
      if (area > 1.5) {
        const ovladani = selectedParameters['ovladani_brzda'];
        if (ovladani !== 'prevodovka') {
          toast.error('Pro žaluzie nad 1.5 m² musíte zvolit "Převodovku s brzdou" (kvůli zachování záruky).', { duration: 5000 });
          return;
        }
      }
    }

    // Validace pro Optima (běžná)
    if (product.title === 'Textilní roletka Optima') {
      if (w > 1950 && h > 1850) {
        toast.error('Z důvodu výrobních rozměrů nelze vyrobit roletku, kde šířka i výška současně přesahují 1950 mm. U šířky > 1950 mm je výška limitována na 1850 mm.', { duration: 6000 });
        return;
      }
    }
    
    // Společné ověření pro produkty Optima
    if (product.title.toLowerCase().includes('optima')) {
      
      if (color && color.includes('12002') && h > 1100) {
        toast.error('Látka Melisa BO 12002 má omezenou maximální výšku na 1100 mm.', { duration: 5000 });
        return;
      }

      if (selectedFabricGroupConfigIndex !== null && product.fabric_groups_config && product.fabric_groups_config[selectedFabricGroupConfigIndex]) {
        const groupConfig = product.fabric_groups_config[selectedFabricGroupConfigIndex];
        let maxW = groupConfig.max_width_mm;
        let maxH = groupConfig.max_height_mm;
        
        if (color) {
          const selectedColorObj = groupConfig.colors.find(c => c.name === color);
          if (selectedColorObj) {
            if (selectedColorObj.max_width_mm) maxW = selectedColorObj.max_width_mm;
            if (selectedColorObj.max_height_mm) maxH = selectedColorObj.max_height_mm;
          }
        }
        
        if (maxW && w > maxW) {
           toast.error(`Vybraná látka se v této šířce nedá vyrobit (maximum je ${maxW} mm).`, { duration: 5000 });
           return;
        }
        if (maxH && h > maxH) {
           toast.error(`Vybraná látka se v této výšce nedá vyrobit (maximum je ${maxH} mm).`, { duration: 5000 });
           return;
        }
      }
    }

    addLine({
      productId: product.id,
      title: product.title,
      img: product.img,
      category: product.category,
      widthMm: w,
      heightMm: h,
      quantity: 1,
      unitPriceCzk: Math.round(quote.total_czk),
      options: buildOptions(),
    });
  };

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center p-12 text-gray-500">
        <div className="animate-spin w-8 h-8 rounded-full border-4 border-gray-200 border-t-[#CCAD8A] mr-3"></div>
        Načítám produkt…
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="flex-grow container mx-auto px-6 py-24">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>
        <a href="#/kategorie" className="inline-block mt-6 text-[#CCAD8A] font-bold">
          ← Zpět do katalogu
        </a>
      </div>
    );
  }

  const dim = product.dimension_constraints;
  const prof = product.validation_profile;
  const plainDesc = product.desc.replace(/<[^>]+>/g, '').substring(0, 150) + '...';
  const measureImg = product.extras?.find((e: any) => e.key === 'measure_guide_img')?.value;
  const allImages = [product.img, ...(product.gallery || [])];
  if (measureImg && !allImages.includes(measureImg)) {
    allImages.push(measureImg);
  }

  const productTitleBlock = (
    <>
      <span className="text-[#CCAD8A] text-xs font-bold uppercase tracking-widest bg-[#CCAD8A]/10 px-3 py-1 rounded-full inline-block mb-3">
        {product.category}
      </span>
      <h1 className="text-3xl sm:text-4xl font-extrabold text-[#132333] leading-tight">{product.title}</h1>
      <p className="text-sm text-gray-500 mt-4 leading-relaxed font-light">
        {product.desc ? (product.desc.replace(/<[^>]+>/g, '').split(/(?<=\.)\s+/)[0] + (product.desc.replace(/<[^>]+>/g, '').split(/(?<=\.)\s+/)[0].endsWith('.') ? '' : '.')) : "Kvalitní a elegantní řešení pro vaše okna."} Užívejte si dokonalou regulaci světla a soukromí s produkty přesně na míru.
      </p>
      
      <ul className="mt-5 space-y-2">
        <li className="flex items-center gap-2 text-sm text-gray-700">
          <Check size={16} className="text-green-500 flex-shrink-0" />
          <span>Výroba přesně na míru vašemu oknu</span>
        </li>
        <li className="flex items-center gap-2 text-sm text-gray-700">
          <Check size={16} className="text-green-500 flex-shrink-0" />
          <span>Kvalitní materiály a precizní zpracování</span>
        </li>
        <li className="flex items-center gap-2 text-sm text-gray-700">
          <Check size={16} className="text-green-500 flex-shrink-0" />
          <span>Dlouhá životnost a snadná údržba</span>
        </li>
      </ul>

      <div className="mt-6 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm font-bold border border-green-100">
          <PackageCheck size={18} /> Skladem
        </div>
        <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-sm font-bold border border-blue-100">
          <Truck size={18} /> Obvyklé doručení do 14 dnů
        </div>
      </div>
    </>
  );

  const productInfoBlock = (
    <div className="space-y-8 max-w-3xl">
      <div className="border-b border-gray-100 pb-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-[#CCAD8A]/10 text-[#CCAD8A] rounded-lg">
            <Info size={24} />
          </div>
          <h2 className="text-2xl font-bold text-[#132333]">Informace k produktu</h2>
        </div>
        <div 
          className="prose prose-lg prose-gray max-w-none text-gray-600 leading-relaxed font-light [&>ul]:list-disc [&>ul]:ml-5 [&>ul]:mt-4 [&>ul>li]:mb-2 [&>p]:mb-4"
          dangerouslySetInnerHTML={{ __html: sanitizeGuideHtml(product.desc || '<p>Popis není k dispozici.</p>') }}
        />
      </div>

      {dim && (
        <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Ruler size={24} />
            </div>
            <h3 className="text-xl font-bold text-[#132333]">Parametry a specifikace</h3>
          </div>
          
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <div className="flex justify-between items-center py-2 border-b border-gray-200">
              <dt className="text-gray-500">Minimální šířka</dt>
              <dd className="font-medium text-gray-900">{dim.width_mm_min} mm</dd>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-200">
              <dt className="text-gray-500">Maximální šířka</dt>
              <dd className="font-medium text-gray-900">{dim.width_mm_max} mm</dd>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-200">
              <dt className="text-gray-500">Minimální výška</dt>
              <dd className="font-medium text-gray-900">{dim.height_mm_min} mm</dd>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-200">
              <dt className="text-gray-500">Maximální výška</dt>
              <dd className="font-medium text-gray-900">{dim.height_mm_max} mm</dd>
            </div>
            {dim.max_area_m2 && (
              <div className="flex justify-between items-center py-2 border-b border-gray-200 sm:col-span-2">
                <dt className="text-gray-500">Maximální plocha</dt>
                <dd className="font-medium text-gray-900">{dim.max_area_m2} m²</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-grow bg-gray-50 min-h-screen pb-32">
      <div className="container mx-auto px-4 sm:px-6 py-8 lg:py-12">
        <Helmet>
          <title>{product.title} | E-shop Qapi</title>
          <meta name="description" content={plainDesc} />
        </Helmet>
        
        <a href="#/kategorie" className="text-sm text-gray-500 hover:text-[#CCAD8A] font-medium transition-colors mb-6 inline-flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 w-fit">
          <span aria-hidden="true">←</span> Zpět do katalogu
        </a>

        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start relative">
          {/* Left Column: Images & Info (Sticky) */}
          <div className="w-full lg:w-[55%] space-y-8 lg:sticky lg:top-24">
            
            {/* Mobile Title (visible only on mobile) */}
            <div className="block lg:hidden mb-2">
              {productTitleBlock}
            </div>

            {/* Images */}
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
            <div 
              className="rounded-2xl overflow-hidden border border-gray-100 bg-white shadow-sm aspect-[4/3] mb-4 relative group cursor-zoom-in"
              onClick={() => {
                const index = allImages.indexOf(mainImg || product.img);
                setLightboxIndex(index >= 0 ? index : 0);
              }}
            >
              <img src={mainImg || product.img} alt={product.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            </div>
            {product.gallery && product.gallery.length > 0 && (
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide py-1">
                <button
                  onClick={() => setMainImg(product.img)}
                  className={`flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border-2 transition-all duration-200 ${
                    (mainImg || product.img) === product.img ? 'border-[#CCAD8A] shadow-md scale-105' : 'border-transparent hover:border-gray-200 opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={product.img} className="w-full h-full object-cover" alt="Thumb" />
                </button>
                {product.gallery.map((gImg: string, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setMainImg(gImg)}
                    className={`flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border-2 transition-all duration-200 ${
                      mainImg === gImg ? 'border-[#CCAD8A] shadow-md scale-105' : 'border-transparent hover:border-gray-200 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={gImg} className="w-full h-full object-cover" alt={`Thumb ${idx + 1}`} />
                  </button>
                ))}
              </div>
            )}
          </div>


          {/* Desktop Info (visible only on desktop) */}
          <div className="hidden lg:block mt-8">
            {productInfoBlock}
          </div>
        </div>

        {/* Right Column: Calculator Widget */}
        <div className="w-full lg:w-[45%]">
            <div className="bg-white border border-gray-100 rounded-[2rem] p-6 lg:p-10 shadow-xl shadow-gray-200/40 relative overflow-hidden">
              {/* Decorative background element */}
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#132333] via-[#CCAD8A] to-[#132333]"></div>
            
          {/* Desktop Title (visible only on desktop) */}
          <div className="hidden lg:block mb-8">
            {productTitleBlock}
          </div>

            <div className="space-y-6">
              {/* Dimensions */}
              <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100">
                <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center text-sm text-[#CCAD8A]">1</span>
                  Zadejte rozměry
                  {measureImg && (
                    <button 
                      onClick={() => {
                        setLightboxImages(allImages);
                        setLightboxIndex(allImages.indexOf(measureImg));
                      }}
                      className="ml-auto flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white transition-colors"
                      title="Jak zaměřit"
                    >
                      ?
                    </button>
                  )}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider absolute top-2 left-3 z-10">
                      Šířka (mm)
                    </label>
                    <input
                      type="number"
                      min={dim?.width_mm_min ?? 1}
                      max={dim?.width_mm_max}
                      value={widthMm}
                      onChange={(e) => {
                        setWidthMm(e.target.value);
                        setQuote(null);
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 pt-6 pb-2 focus:ring-2 focus:ring-[#CCAD8A] focus:border-[#CCAD8A] outline-none transition-all placeholder-transparent font-medium"
                      placeholder={dim ? `${dim.width_mm_min}-${dim.width_mm_max}` : "0"}
                    />
                    {dim && <p className="text-[10px] text-gray-400 absolute bottom-2 right-3">min: {dim.width_mm_min}, max: {dim.width_mm_max}</p>}
                  </div>
                  <div className="relative">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider absolute top-2 left-3 z-10">
                      Výška (mm)
                    </label>
                    <input
                      type="number"
                      min={dim?.height_mm_min ?? 1}
                      max={dim?.height_mm_max}
                      value={heightMm}
                      onChange={(e) => {
                        setHeightMm(e.target.value);
                        setQuote(null);
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 pt-6 pb-2 focus:ring-2 focus:ring-[#CCAD8A] focus:border-[#CCAD8A] outline-none transition-all placeholder-transparent font-medium"
                      placeholder={dim ? `${dim.height_mm_min}-${dim.height_mm_max}` : "0"}
                    />
                    {dim && <p className="text-[10px] text-gray-400 absolute bottom-2 right-3">min: {dim.height_mm_min}, max: {dim.height_mm_max}</p>}
                  </div>
                </div>
                {widthMm && heightMm && (
                  <div className="mt-3 text-sm text-gray-600 bg-gray-100 rounded-xl px-4 py-2 border border-gray-200">
                    <strong>Plocha:</strong> {((Number(widthMm) * Number(heightMm)) / 1000000).toFixed(2)} m²
                    {product?.title?.toLowerCase().includes('isoline') && ((Number(widthMm) * Number(heightMm)) / 1000000) < 0.5 && (
                      <span className="text-[#CCAD8A] ml-2 font-medium">(účtováno 0.5 m²)</span>
                    )}
                  </div>
                )}
              </div>

              {/* Color Palette or Fabric Groups */}
              {product?.fabric_groups_config && product.fabric_groups_config.length > 0 ? (
                <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100">
                  <h3 className="text-base font-bold text-gray-900 mb-5 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center text-sm text-[#CCAD8A]">2</span>
                    {product.extras?.find((e: any) => e.key === 'colorSectionTitle')?.value || 'Vyberte látku'}
                  </h3>
                  
                  {/* Select group */}
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-gray-600 mb-2">1. Skupina látek</label>
                    <div className="flex flex-wrap gap-2">
                      {product.fabric_groups_config.map((g, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setSelectedFabricGroupConfigIndex(idx);
                            setColor(''); // let user pick new color from group
                          }}
                          className={`px-4 py-2 text-sm font-medium rounded-xl border-2 transition-all duration-200 outline-none ${
                            selectedFabricGroupConfigIndex === idx
                              ? 'border-[#CCAD8A] bg-[#CCAD8A]/10 text-[#CCAD8A] shadow-sm'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{g.name}</span>
                            {(g.surcharge || g.surcharge_percent) ? (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider ${
                                selectedFabricGroupConfigIndex === idx 
                                  ? 'bg-[#CCAD8A]/20 text-[#CCAD8A]' 
                                  : 'bg-gray-100 text-gray-500'
                              }`}>
                                {g.surcharge ? `+${g.surcharge} Kč` : `+${g.surcharge_percent} %`}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Show color palette for selected group */}
                  {selectedFabricGroupConfigIndex !== null && product.fabric_groups_config[selectedFabricGroupConfigIndex] && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                      <label className="block text-xs font-semibold text-gray-600 mb-3">2. Látka ze skupiny</label>
                      {product.fabric_groups_config[selectedFabricGroupConfigIndex].colors.length > 0 ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                          {product.fabric_groups_config[selectedFabricGroupConfigIndex].colors.map((cNameOrObj: any) => {
                            const cName = typeof cNameOrObj === 'string' ? cNameOrObj : cNameOrObj.name;
                            const cImg = typeof cNameOrObj === 'string' ? undefined : cNameOrObj.img;
                            return (
                                <button
                                  key={cName}
                                  onClick={() => {
                                    setColor(cName);
                                  }}
                                  className={`relative group overflow-hidden border-2 transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#CCAD8A] ${
                                  color === cName ? 'border-[#CCAD8A] shadow-md scale-105' : 'border-gray-200 hover:border-[#132333]'
                                } ${cImg ? 'w-full aspect-square rounded-xl flex items-center justify-center bg-gray-50' : 'w-full px-2 py-3 text-sm font-medium rounded-xl text-gray-700 bg-white'}`}
                                title={cName}
                              >
                                {cImg ? (
                                  <>
                                    <img src={cImg} alt={cName} className="w-full h-full object-cover" />
                                    <div className="absolute inset-x-0 bottom-0 bg-black/60 pt-2 pb-1.5 px-1 flex items-end">
                                      <span className="text-white text-[10px] sm:text-[11px] leading-tight font-medium w-full text-center drop-shadow-sm">{cName}</span>
                                    </div>
                                    {color === cName && (
                                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center pb-4">
                                        <Check className="text-white drop-shadow-md shadow-black" size={24} strokeWidth={3} />
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <span>{cName}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">Pro tuto skupinu nejsou nahrány žádné obrázky látek.</p>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    {color ? `Vybrána látka: ${color}` : 'Vyberte látku kliknutím na vzorník.'}
                  </p>
                </div>
              ) : product?.colors && product.colors.length > 0 ? (
                <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100">
                  <h3 className="text-base font-bold text-gray-900 mb-5 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center text-sm text-[#CCAD8A]">2</span>
                    {product.extras?.find((e: any) => e.key === 'colorSectionTitle')?.value || 'Vyberte barvu profilu/látky'}
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {product.colors.map((c: any) => {
                      const cName = typeof c === 'string' ? c : c.name;
                      const cImg = typeof c === 'string' ? undefined : c.img;
                      return (
                        <button
                          key={cName}
                          onClick={() => {
                            setColor(cName);
                          }}
                          className={`relative group overflow-hidden border-2 transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#CCAD8A] ${
                            color === cName ? 'border-[#CCAD8A] shadow-md scale-105' : 'border-gray-200 hover:border-[#132333]'
                          } ${cImg ? 'w-20 h-16 rounded-xl' : 'px-4 py-2 text-sm font-medium rounded-xl text-gray-700 bg-white'}`}
                          title={cName}
                        >
                          {cImg ? (
                            <>
                              <img src={cImg} alt={cName} className="w-full h-full object-cover" />
                              <div className="absolute inset-x-0 bottom-0 bg-black/60 pt-2 pb-1 px-1 min-h-[50%] flex items-end">
                                <span className="text-white text-[10px] sm:text-xs leading-none font-medium truncate w-full text-center drop-shadow-sm">{cName}</span>
                              </div>
                              {color === cName && (
                                <div className="absolute inset-0 bg-black/20 flex items-center justify-center pb-3">
                                  <Check className="text-white drop-shadow-md shadow-black" size={24} strokeWidth={3} />
                                </div>
                              )}
                            </>
                          ) : (
                            cName
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {color ? `Vybrána barva: ${color}` : 'Vyberte barvu kliknutím na vzorník.'}
                  </p>
                </div>
              ) : null}

              {/* Specific Options */}
              {(prof === 'textile_zaluzie' || prof === 'screen_roleta_union_l') && (
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-500">3</span>
                    Specifikace látky
                  </h3>
                  {fabricGroups?.length > 0 ? (
                    <div className="space-y-4">
                      {fabricGroups.map((group) => (
                        <div key={group.id} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                          <h4 className="font-semibold text-gray-900 mb-2">
                            {group.name} 
                            <span className="text-sm text-gray-500 ml-2 font-normal">(+{Number(group.surcharge)} Kč/m²)</span>
                          </h4>
                          <div className="flex flex-wrap gap-3">
                            {group.colors?.map((c: any) => {
                              const isSelected = selectedFabricColorId === c.id;
                              return (
                                <button
                                  key={c.id}
                                  onClick={() => {
                                    setFabric(c.name);
                                    setSelectedFabricColorId(c.id);
                                    setSelectedFabricGroupId(group.id);
                                  }}
                                  title={c.name}
                                  className={`relative w-10 h-10 rounded-full border-2 transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#CCAD8A] overflow-hidden ${
                                    isSelected ? 'scale-110 border-[#CCAD8A] shadow-md' : 'border-gray-200 hover:scale-105'
                                  }`}
                                  style={{ backgroundColor: c.img ? 'transparent' : c.hex }}
                                >
                                  {c.img && (
                                    <img src={c.img} alt={c.name} className="absolute inset-0 w-full h-full object-cover" />
                                  )}
                                  {isSelected && (
                                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 rounded-full text-white">
                                      <Check size={16} />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      <div className="text-sm text-gray-500">
                        Nebo zadejte název / kód látky ručně:
                      </div>
                      <div className="relative">
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider absolute top-2 left-3 z-10">
                          Název / kód látky
                        </label>
                        <input
                          type="text"
                          value={fabric}
                          onChange={(e) => {
                             setFabric(e.target.value);
                             setSelectedFabricColorId(null);
                             setSelectedFabricGroupId(null);
                          }}
                          className="w-full border border-gray-200 rounded-xl px-3 pt-6 pb-2 focus:ring-2 focus:ring-[#CCAD8A] focus:border-[#CCAD8A] outline-none transition-all font-medium"
                          placeholder="(volitelné)"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider absolute top-2 left-3 z-10">
                        Název / kód látky
                      </label>
                      <input
                        type="text"
                        value={fabric}
                        onChange={(e) => setFabric(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 pt-6 pb-2 focus:ring-2 focus:ring-[#CCAD8A] focus:border-[#CCAD8A] outline-none transition-all font-medium"
                        placeholder="(volitelné)"
                      />
                    </div>
                  )}
                </div>
              )}

              {prof === 'plise' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-500">3</span>
                      Model plisé
                    </h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                      {['PM1', 'PM2', 'PM3', 'PS3'].map((m) => (
                        <button
                          key={m}
                          onClick={() => {
                            setPliseModel(m);
                            setQuote(null);
                          }}
                          className={`flex-1 py-2 px-3 text-sm font-bold rounded-xl border transition-all ${
                            pliseModel === m
                              ? 'bg-[#132333] text-white border-[#132333] shadow-md'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-[#132333] hover:text-[#132333]'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {prof === 'venkovni_roleta_radix' && (
                <div>
                   <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-500">3</span>
                    Lamela
                  </h3>
                  <div className="relative">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider absolute top-2 left-3 z-10">
                      Zadejte lamelu
                    </label>
                    <input
                      type="text"
                      value={lamela}
                      onChange={(e) => setLamela(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 pt-6 pb-2 focus:ring-2 focus:ring-[#CCAD8A] focus:border-[#CCAD8A] outline-none transition-all font-medium"
                      placeholder="39 nebo 40"
                    />
                  </div>
                </div>
              )}

              {prof === 'screen_roleta_union_l' && (
                <div className="bg-gray-50 p-4 rounded-xl space-y-3 border border-gray-100/80">
                  <label className="flex items-center justify-between cursor-pointer group">
                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Polyscreen látka</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">+40 %</span>
                      <input
                        type="checkbox"
                        checked={polyscreen}
                        onChange={(e) => setPolyscreen(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300 text-[#CCAD8A] focus:ring-[#CCAD8A]"
                      />
                    </div>
                  </label>
                  <label className="flex items-center justify-between cursor-pointer group pt-3 border-t border-gray-200/50">
                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Dodat bez látky</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-red-500 font-medium">−25 %</span>
                      <input
                        type="checkbox"
                        checked={bezLatky}
                        onChange={(e) => setBezLatky(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300 text-[#CCAD8A] focus:ring-[#CCAD8A]"
                      />
                    </div>
                  </label>
                  <label className="flex items-center justify-between cursor-pointer group pt-3 border-t border-gray-200/50">
                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Spodní profil v RAL</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">+10 %</span>
                      <input type="checkbox" checked={ral} onChange={(e) => setRal(e.target.checked)} className="w-5 h-5 rounded border-gray-300 text-[#CCAD8A] focus:ring-[#CCAD8A]" />
                    </div>
                  </label>
                </div>
              )}

              {/* Extras (Příplatkové položky) */}
              {product?.extras && product.extras.length > 0 && (
                <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100">
                  <h3 className="text-base font-bold text-gray-900 mb-5 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center text-sm text-[#CCAD8A]">+</span>
                    Příplatkové položky
                  </h3>
                  {product.extras.map(extra => (
                    <label key={extra.id} className="flex items-center justify-between cursor-pointer group pt-2 first:pt-0 border-t first:border-0 border-gray-200/50">
                      <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{extra.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-gray-500">+{extra.price} Kč</span>
                        <input
                          type="checkbox"
                          checked={selectedExtras.includes(extra.id)}
                          onChange={(e) => {
                            setQuote(null);
                            if (e.target.checked) {
                              setSelectedExtras(prev => [...prev, extra.id]);
                            } else {
                              setSelectedExtras(prev => prev.filter(id => id !== extra.id));
                            }
                          }}
                          className="w-5 h-5 rounded border-gray-300 text-[#CCAD8A] focus:ring-[#CCAD8A]"
                        />
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* Vlastní Parametry */}
              {visibleParameters.length > 0 && (
                <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100 space-y-6">
                  {visibleParameters.map(param => (
                    <div key={param.id} className="pt-4 first:pt-0 border-t first:border-0 border-gray-200/50">
                      <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#CCAD8A]"></span>
                        {param.name}
                      </h3>
                      
                      {param.type === 'select' ? (
                        <div className="relative">
                          <select
                            value={selectedParameters[param.id] || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSelectedParameters(prev => ({ ...prev, [param.id]: val }));
                              setQuote(null);
                              const opt = param.options.find(o => o.value === val);
                              if (opt?.img) setMainImg(opt.img);
                            }}
                            className="w-full border border-gray-200 rounded-xl px-3 py-3 focus:ring-2 focus:ring-[#CCAD8A] focus:border-[#CCAD8A] outline-none transition-all font-medium text-sm text-gray-700 bg-white"
                          >
                            <option value="" disabled>-- Vyberte --</option>
                            {param.options.map(opt => {
                              const unit = opt.priceType === 'per_m2' ? ' Kč/m²' : opt.priceType === 'per_bm' ? ' Kč/bm šířky' : opt.priceType === 'per_bm_height' ? ' Kč/bm výšky' : ' Kč';
                              return (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label} {opt.priceVariant ? `(+${opt.priceVariant}${unit})` : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      ) : param.type === 'color_array' ? (
                        <div className="flex flex-wrap gap-3">
                          {param.options.map(opt => {
                            const isSelected = selectedParameters[param.id] === opt.value;
                            return (
                              <button
                                key={opt.value}
                                onClick={() => {
                                  setSelectedParameters(prev => ({ ...prev, [param.id]: opt.value }));
                                  setQuote(null);
                                  if (opt.img) setMainImg(opt.img);
                                }}
                                title={`${opt.label} ${opt.priceVariant ? `(+${opt.priceVariant}${opt.priceType === 'per_m2' ? ' Kč/m²' : opt.priceType === 'per_bm' ? ' Kč/bm šířky' : opt.priceType === 'per_bm_height' ? ' Kč/bm výšky' : ' Kč'})` : ''}`}
                                className={`relative group overflow-hidden border-2 transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#CCAD8A] ${
                                  isSelected ? 'border-[#CCAD8A] shadow-md scale-105' : 'border-gray-200 hover:border-[#132333]'
                                } ${opt.img ? 'w-20 h-16 rounded-xl' : 'px-4 py-2 text-sm font-medium rounded-xl text-gray-700 bg-white'}`}
                                style={!opt.img && opt.colorCode ? { backgroundColor: opt.colorCode } : {}}
                              >
                                {opt.img ? (
                                  <>
                                    <img src={opt.img} alt={opt.label} className="w-full h-full object-cover bg-gray-50" />
                                    <div className="absolute inset-x-0 bottom-0 bg-black/60 pt-2 pb-1 px-1 min-h-[50%] flex items-end">
                                      <span className="text-white text-[10px] sm:text-xs leading-none font-medium truncate w-full text-center drop-shadow-sm">{opt.label}</span>
                                    </div>
                                    {isSelected && (
                                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center pb-3">
                                        <Check className="text-white drop-shadow-md shadow-black" size={24} strokeWidth={3} />
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <span className={opt.colorCode ? 'mix-blend-difference filter drop-shadow-sm font-bold text-white' : ''}>{opt.label}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ) : param.type === 'numeric' ? (
                        <div className="relative">
                          <input
                            type="number"
                            min={param.numericSettings?.min}
                            max={param.numericSettings?.max}
                            value={selectedParameters[param.id] || param.numericSettings?.defaultValue || ''}
                            onChange={(e) => {
                              setSelectedParameters(prev => ({ ...prev, [param.id]: e.target.value }));
                              setQuote(null);
                            }}
                            className="w-full border border-gray-200 rounded-xl px-3 py-3 focus:ring-2 focus:ring-[#CCAD8A] focus:border-[#CCAD8A] outline-none transition-all font-medium text-sm text-gray-700 bg-white"
                            placeholder={param.numericSettings ? `Zadejte hodnotu (min: ${param.numericSettings.min || 0})` : 'Zadejte hodnotu'}
                          />
                          {param.numericSettings?.min !== undefined && param.numericSettings?.max !== undefined && (
                            <p className="text-[10px] text-gray-400 mt-1">min: {param.numericSettings.min}, max: {param.numericSettings.max}</p>
                          )}
                        </div>
                      ) : null}
                      {selectedParameters[param.id] && param.options.find(o => o.value === selectedParameters[param.id])?.priceVariant ? (() => {
                         const opt = param.options.find(o => o.value === selectedParameters[param.id])!;
                         const unit = opt.priceType === 'per_m2' ? ' Kč/m²' : opt.priceType === 'per_bm' ? ' Kč/bm šířky' : opt.priceType === 'per_bm_height' ? ' Kč/bm výšky' : ' Kč';
                         return (
                           <p className="text-xs text-gray-500 mt-2">
                             Příplatek za volbu: +{opt.priceVariant}{unit}
                           </p>
                         );
                      })() : null}
                    </div>
                  ))}
                </div>
              )}

              {/* Action Warnings (Only shown if there's a quote with notes) */}
              {quote && (quote.vat_note || quote.catalog_warning || quote.catalog_note) && (
                <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-6 mt-4">
                  <p className="text-sm text-blue-800 font-semibold mb-3 flex items-center gap-2">
                    <Info size={18} /> Doplňující informace ke kalkulaci
                  </p>
                  {quote.vat_note && <p className="text-xs text-gray-600 mb-2">{quote.vat_note}</p>}
                  {quote.catalog_warning && (
                    <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mb-2 border border-amber-200">
                      {quote.catalog_warning}
                    </p>
                  )}
                  {quote.catalog_note && (
                    <p className="text-xs text-gray-600">{quote.catalog_note}</p>
                  )}
                </div>
              )}
            </div>
            
            {/* Trust Badges */}
            <div className="mt-8 grid grid-cols-2 gap-4">
              <div className="flex flex-col items-center justify-center text-center p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                </div>
                <span className="text-xs font-bold text-gray-900">Záruka kvality</span>
                <span className="text-[10px] text-gray-500 mt-1">Poctivé zpracování</span>
              </div>
              <div className="flex flex-col items-center justify-center text-center p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="w-10 h-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                <span className="text-xs font-bold text-gray-900">Rychlé dodání</span>
                <span className="text-[10px] text-gray-500 mt-1">Přímo od výrobce</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Info (visible only on mobile) */}
      <div className="block lg:hidden px-4 mt-8 mb-12">
        {productInfoBlock}
      </div>

      {/* Reviews Section - Full Width */}
      <div className="w-full bg-white border-t border-gray-200 py-16 mt-8">
        <div className="container mx-auto px-4 sm:px-6 max-w-7xl">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Hodnocení zákazníků</h2>
            {reviews.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center text-yellow-400">
                  <Star className="fill-current w-5 h-5" />
                  <span className="ml-1.5 text-lg font-bold text-gray-900">
                    {(reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)}
                  </span>
                </div>
                <span className="text-gray-500 text-sm">({reviews.length} hodnocení)</span>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowReviewModal(true)}
            className="px-6 py-2.5 bg-white border-2 border-gray-200 text-gray-700 font-bold rounded-xl hover:border-[#CCAD8A] hover:text-[#CCAD8A] transition-colors"
          >
            Napsat recenzi
          </button>
        </div>

        {reviewsLoading ? (
          <div className="animate-pulse flex space-x-4">
            <div className="flex-1 space-y-4 py-1">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              </div>
            </div>
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-100">
            <p className="text-gray-500 mb-4">Zatím nebylo přidáno žádné hodnocení.</p>
            <p className="text-sm text-gray-400">Buďte první, kdo se podělí o zkušenost!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reviews.map(review => (
              <div key={review.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="font-bold text-gray-900">{review.author_name}</span>
                    <span className="text-xs text-gray-400 block mt-0.5">
                      {new Date(review.created_at).toLocaleDateString('cs-CZ')}
                    </span>
                  </div>
                  <div className="flex text-yellow-400">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className={`w-4 h-4 ${i < review.rating ? 'fill-current' : 'text-gray-200'}`} />
                    ))}
                  </div>
                </div>
                {review.text && <p className="text-gray-600 text-sm mb-4 flex-grow">{review.text}</p>}
                {review.images && review.images.length > 0 && (
                  <div className="flex gap-2 mt-auto overflow-x-auto pb-1 scrollbar-hide">
                    {review.images.map((imgUrl, i) => (
                      <img 
                        key={i} 
                        src={imgUrl} 
                        alt="Fotka od zákazníka" 
                        className="w-16 h-16 object-cover rounded-lg cursor-zoom-in border border-gray-200 hover:border-[#CCAD8A] transition-colors flex-shrink-0"
                        onClick={() => {
                          const reviewImages = review.images!;
                          setLightboxImages(reviewImages);
                          setLightboxIndex(i);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] z-40 px-4 py-4 sm:px-6 animate-in slide-in-from-bottom-full duration-500">
        <div className="container mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="w-full sm:w-auto">
            {quote ? (
              <div className="flex flex-col">
                <span className="text-[10px] text-green-600 font-bold uppercase tracking-wider mb-0.5">Výsledná cena vč. DPH</span>
                <span className="text-3xl font-black text-[#132333] tracking-tight">{formatCzk(quote.total_czk)} Kč</span>
              </div>
            ) : quoteError ? (
              <div className="text-red-600 font-medium text-sm flex items-center gap-2 bg-red-50 px-4 py-2 rounded-xl">
                <AlertCircle size={18} /> {quoteError}
              </div>
            ) : (
              <div className="text-gray-500 text-sm font-medium">Zadejte parametry pro zobrazení ceny</div>
            )}
          </div>
          
          <div className="w-full sm:w-auto flex gap-3">
            {quote ? (
              <>
                <button
                  type="button"
                  onClick={runQuote}
                  disabled={quoting}
                  className="px-6 py-3.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {quoting ? '...' : 'Přepočítat'}
                </button>
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="flex-1 sm:flex-none px-8 py-3.5 bg-[#CCAD8A] text-[#132333] font-bold rounded-xl hover:bg-[#b5997a] hover:text-white transition-all shadow-md flex items-center justify-center gap-2 transform hover:-translate-y-0.5"
                >
                  <ShoppingCart size={20} />
                  Vložit do košíku
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={runQuote}
                disabled={quoting || !widthMm || !heightMm}
                className="w-full sm:w-auto px-10 py-3.5 bg-[#132333] text-white font-bold rounded-xl hover:bg-[#1a3145] transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {quoting && <div className="animate-spin w-4 h-4 rounded-full border-2 border-white/30 border-t-white"></div>}
                {quoting ? 'Počítám…' : 'Spočítat cenu na míru'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && lightboxImages.length > 0 && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setLightboxIndex(null)}
        >
          <button 
            className="absolute top-4 right-4 text-white hover:text-gray-300 bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors z-50 backdrop-blur-sm"
            onClick={(e) => { e.stopPropagation(); setLightboxIndex(null); }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          
          {(() => {
            const hasPrev = lightboxIndex > 0;
            const hasNext = lightboxIndex < lightboxImages.length - 1;
            return (
              <>
                {hasPrev && (
                  <button 
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 bg-white/10 hover:bg-white/20 p-3 rounded-full transition-colors z-50 backdrop-blur-sm"
                    onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                  </button>
                )}
                
                <img 
                  src={lightboxImages[lightboxIndex]} 
                  alt="Zvětšený náhled" 
                  className="max-w-full max-h-full object-contain filter drop-shadow-2xl select-none"
                  onClick={(e) => e.stopPropagation()}
                />
                
                {hasNext && (
                  <button 
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 bg-white/10 hover:bg-white/20 p-3 rounded-full transition-colors z-50 backdrop-blur-sm"
                    onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && (
        <ReviewModal
          productId={product.id}
          onClose={() => setShowReviewModal(false)}
          onSuccess={() => {
            setShowReviewModal(false);
            alert('Děkujeme za zpětnou vazbu.');
          }}
        />
      )}
    </div>
  );
}
