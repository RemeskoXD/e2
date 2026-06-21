import { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { computeDisplayPriceCzk, formatCzk, toMoneyNumber } from '../lib/money';

interface Product {
  id: number | string;
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
}

export default function FeaturedProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchProducts = async () => {
    setFetchError(null);
    try {
      const [prodRes, setRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/store-settings')
      ]);
      const data = await prodRes.json();
      const settings = await setRes.json();
      
      if (!prodRes.ok) {
        setProducts([]);
        setFetchError(typeof data?.error === 'string' ? data.error : 'Produkty se nepodařilo načíst.');
        return;
      }
      
      let allProds: Product[] = Array.isArray(data) ? data : [];
      if (settings.recommendedProducts && settings.recommendedProducts.length > 0) {
        // filter and sort by recommendedProducts array of slugs
        const recSlugs = settings.recommendedProducts;
        allProds = recSlugs.map((slug: string) => allProds.find((p: any) => p.slug === slug || String(p.id) === slug)).filter(Boolean) as Product[];
      } else {
        // fallback
        allProds = allProds.slice(0, 8);
      }
      
      setProducts(allProds);
    } catch {
      setProducts([]);
      setFetchError('Nelze se spojit se serverem.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const customerPrice = (p: Product) =>
    p.display_price != null && Number.isFinite(p.display_price)
      ? p.display_price
      : computeDisplayPriceCzk(
          p.price,
          toMoneyNumber(p.supplier_markup_percent),
          toMoneyNumber(p.commission_percent)
        );

  const customerOldPrice = (p: Product) => {
    if (p.old_display_price != null && Number.isFinite(p.old_display_price) && p.old_display_price > 0) {
      return p.old_display_price;
    }
    const baseOld = toMoneyNumber(p.oldPrice);
    if (baseOld <= 0) return null;
    return computeDisplayPriceCzk(
      baseOld,
      toMoneyNumber(p.supplier_markup_percent),
      toMoneyNumber(p.commission_percent)
    );
  };

  return (
    <section className="pt-10 pb-20">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#132333] mb-4 tracking-tight">Lidé nejčastěji nakupují</h2>
            <p className="text-lg text-gray-500">Nejčastěji konfigurované produkty našimi zákazníky. Ideální poměr ceny a kvality.</p>
          </div>
          <a href="#/kategorie" className="inline-flex items-center text-[#CCAD8A] font-bold hover:text-[#132333] transition-colors text-lg whitespace-nowrap">
            Kompletní nabídka <ArrowRight size={20} className="ml-2" />
          </a>
        </div>

        {fetchError && (
          <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {fetchError}
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-gray-500">Načítám produkty...</div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 text-gray-500 rounded-2xl border border-gray-100 bg-white">
            V katalogu zatím nejsou žádné produkty.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {products.map((product) => (
              <div key={product.id} className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/50 overflow-hidden hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all duration-300 flex flex-col h-full group">
                
                {/* Product Image */}
                <div className="h-64 bg-gray-50 flex items-center justify-center relative overflow-hidden">
                  {/* Badges */}
                  <div className="absolute top-4 left-4 z-10 flex flex-col items-start gap-2">
                    {product.is_action && (
                      <span className="text-[10px] font-bold px-3 py-1.5 rounded uppercase tracking-wider shadow-sm bg-[#E53935] text-white">
                        AKCE
                      </span>
                    )}
                    {product.in_stock && (
                      <span className="text-[10px] font-bold px-3 py-1.5 rounded uppercase tracking-wider shadow-sm bg-green-600 text-white">
                        Skladem
                      </span>
                    )}
                    {product.badge && product.badge !== 'Akce' && product.badge !== 'Skladem' && product.badge !== 'AKCE' && (
                      <span className={`text-[10px] font-bold px-3 py-1.5 rounded uppercase tracking-wider shadow-sm
                        ${product.badge === 'Sleva' ? 'bg-[#E53935] text-white' : 
                          product.badge === 'Bestseller' ? 'bg-[#CCAD8A] text-[#132333]' : 
                          'bg-[#132333] text-white'}`}>
                        {product.badge}
                      </span>
                    )}
                  </div>
                  
                  <img 
                    src={product.img} 
                    alt={product.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-in-out"
                  />
                  
                  {/* Hover overlay quick configure */}
                  <div className="absolute inset-0 bg-[#132333]/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                    <a
                      href={`#/produkt/${product.id}`}
                      className="bg-white text-[#132333] hover:bg-[#CCAD8A] hover:text-white transform translate-y-4 group-hover:translate-y-0 transition-all font-bold py-3 px-6 rounded-full flex items-center gap-2 shadow-lg"
                    >
                      Vybrat variantu
                    </a>
                  </div>
                </div>

                {/* Product Info */}
                <div className="p-8 flex flex-col flex-grow">
                  <span className="text-[11px] text-[#CCAD8A] uppercase tracking-widest mb-2 font-bold block">
                    {product.category}
                  </span>
                  <h3 className="text-xl font-bold text-[#132333] mb-3 leading-tight group-hover:text-[#CCAD8A] transition-colors line-clamp-2">
                    {product.title}
                  </h3>
                  <p className="text-sm text-gray-500 mb-8 line-clamp-2 leading-relaxed">
                    {product.desc ? product.desc.replace(/<[^>]+>/g, '') : ''}
                  </p>
                  
                  {/* Pricing & Add to cart */}
                  <div className="mt-auto">
                    <div className="flex items-end gap-3 mb-6">
                      <span className="text-2xl font-black text-[#132333] tracking-tight">
                        od {formatCzk(customerPrice(product))} Kč
                      </span>
                      {customerOldPrice(product) != null && (
                        <span className="text-sm text-gray-400 line-through mb-1 font-medium">
                          {formatCzk(customerOldPrice(product)!)} Kč
                        </span>
                      )}
                    </div>
                    <a
                      href={`#/produkt/${product.id}`}
                      className="w-full text-center bg-[#F6F8F9] text-[#132333] hover:bg-[#132333] hover:text-white font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center"
                    >
                      Nakonfigurovat
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
