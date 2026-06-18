import { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';

interface Category {
  id?: number;
  name: string;
  count: string;
  img: string;
}

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchCategories = async () => {
    setFetchError(null);
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      if (!res.ok) {
        setCategories([]);
        setFetchError(typeof data?.error === 'string' ? data.error : 'Kategorie se nepodařilo načíst.');
        return;
      }
      setCategories(Array.isArray(data) ? data.filter((c: Category) => c && c.name) : []);
    } catch {
      setCategories([]);
      setFetchError('Nelze se spojit se serverem.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  return (
    <section className="container mx-auto px-6 py-24">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
        <div className="max-w-2xl">
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#132333] tracking-tight mb-4">
            Vyberte si kategorii
          </h2>
          <p className="text-gray-500 text-lg">
            Prozkoumejte naši nabídku prémiového stínění a sítí proti hmyzu. Vše vyrábíme přesně na míru vašemu domovu.
          </p>
        </div>
        <a
          href="#/kategorie"
          className="inline-flex items-center text-[#CCAD8A] font-bold hover:text-[#132333] transition-colors whitespace-nowrap text-lg"
        >
          Kompletní sortiment <ArrowRight size={20} className="ml-2" />
        </a>
      </div>

      {fetchError && (
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {fetchError}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-gray-500">Načítám kategorie...</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-20 text-gray-500 rounded-2xl border border-gray-100 bg-white">
          Žádné kategorie v databázi.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {categories.map((cat, idx) => (
            <a
              key={cat.id ?? idx}
              href={`#/kategorie?cat=${encodeURIComponent(cat.name)}`}
              className="group relative h-[380px] lg:h-[460px] rounded-2xl overflow-hidden block shadow-sm hover:shadow-2xl transition-shadow duration-500"
            >
              {/* Background Image */}
              <div className="absolute inset-0 bg-gray-200">
                 <img 
                   src={cat.img} 
                   alt={cat.name} 
                   className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-in-out" 
                 />
              </div>
              
              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#132333]/90 via-[#132333]/30 to-transparent group-hover:from-[#132333]/95 group-hover:via-[#132333]/40 transition-colors duration-500"></div>
              
              {/* Content */}
              <div className="absolute inset-x-0 bottom-0 p-8 flex flex-col justify-end">
                <span className="text-[#CCAD8A] font-bold text-sm tracking-widest uppercase mb-3 transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 ease-out">
                  {cat.count}
                </span>
                <h3 className="text-2xl lg:text-3xl font-bold text-white mb-2 group-hover:text-white transition-colors duration-300">
                  {cat.name}
                </h3>
                <div className="w-12 h-1 bg-[#CCAD8A] mt-2 transform origin-left group-hover:scale-x-150 transition-transform duration-500"></div>
              </div>
              
              {/* Hover subtle icon */}
              <div className="absolute top-6 right-6 w-12 h-12 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transform translate-x-4 group-hover:translate-x-0 transition-all duration-500">
                <ArrowRight size={20} />
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

