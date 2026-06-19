import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminHomepage() {
  const [settings, setSettings] = useState({
    banners: [] as any[],
    recommendedProducts: [] as string[]
  });
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/store-settings').then(res => res.json()),
      fetch('/api/products').then(res => res.json())
    ]).then(([settingsData, productsData]) => {
      setSettings(settingsData);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setLoading(false);
    }).catch(e => {
      console.error(e);
      toast.error('Chyba při načítání dat');
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/store-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify(settings)
      });
      if (!res.ok) throw new Error('Nepodařilo se uložit');
      toast.success('Nastavení domovské stránky uloženo');
    } catch (e: any) {
      toast.error(e.message || 'Chyba při ukládání');
    } finally {
      setSaving(false);
    }
  };

  const addBanner = () => {
    setSettings(s => ({
      ...s,
      banners: [...s.banners, { id: Date.now().toString(), image: '', title: 'Nový banner', subtitle: '', buttonText: '', link: '' }]
    }));
  };

  const updateBanner = (idx: number, key: string, value: string) => {
    setSettings(s => {
      const newBanners = [...s.banners];
      newBanners[idx] = { ...newBanners[idx], [key]: value };
      return { ...s, banners: newBanners };
    });
  };

  const removeBanner = (idx: number) => {
    setSettings(s => ({
      ...s,
      banners: s.banners.filter((_, i) => i !== idx)
    }));
  };

  const moveBanner = (idx: number, dir: number) => {
    setSettings(s => {
      const b = [...s.banners];
      if (idx + dir < 0 || idx + dir >= b.length) return s;
      const temp = b[idx];
      b[idx] = b[idx + dir];
      b[idx + dir] = temp;
      return { ...s, banners: b };
    });
  };

  const toggleRecommended = (slug: string) => {
    setSettings(s => {
      const isRec = s.recommendedProducts?.includes(slug);
      return {
        ...s,
        recommendedProducts: isRec 
          ? s.recommendedProducts.filter(r => r !== slug)
          : [...(s.recommendedProducts || []), slug]
      };
    });
  };

  if (loading) return <div className="p-8">Načítám...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-[#132333]">Úvodní stránka</h1>
          <p className="text-gray-500 mt-1">Nastavení bannerů a doporučených produktů na HP</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#CCAD8A] hover:bg-[#b5997a] text-[#132333] px-6 py-3 rounded-xl font-bold transition-colors flex items-center gap-2"
        >
          <Save size={20} />
          {saving ? 'Ukládám...' : 'Uložit změny'}
        </button>
      </div>

      <div className="space-y-8">
        {/* Banners Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-[#132333]">Promo Bannery (Karusel)</h2>
            <button onClick={addBanner} className="flex items-center gap-2 text-sm bg-gray-100 px-4 py-2 rounded-lg font-medium hover:bg-gray-200 text-[#132333]">
              <Plus size={16} /> Přidat banner
            </button>
          </div>
          
          <div className="space-y-6">
            {settings.banners?.length === 0 && (
              <p className="text-gray-500 text-sm italic">Nemáte žádné bannery. Bude zobrazeno prázdné pole.</p>
            )}
            {settings.banners?.map((banner, idx) => (
              <div key={banner.id} className="border border-gray-200 rounded-xl p-6 bg-gray-50 relative group">
                <div className="absolute top-4 right-4 flex items-center gap-2">
                  <button onClick={() => moveBanner(idx, -1)} className="p-2 bg-white rounded shadow-sm hover:text-[#CCAD8A]" title="Nahoru"><ArrowUp size={16} /></button>
                  <button onClick={() => moveBanner(idx, 1)} className="p-2 bg-white rounded shadow-sm hover:text-[#CCAD8A]" title="Dolů"><ArrowDown size={16} /></button>
                  <button onClick={() => removeBanner(idx)} className="p-2 bg-white text-red-500 rounded shadow-sm hover:bg-red-50"><Trash2 size={16} /></button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Obrázek (URL)</label>
                    <input type="text" value={banner.image} onChange={(e) => updateBanner(idx, 'image', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded focus:border-[#CCAD8A] outline-none text-sm" placeholder="https://... (poměr 16:9)" />
                    {banner.image && <img src={banner.image} className="mt-2 h-32 w-full object-cover rounded-lg border border-gray-200" alt="Náhled" />}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Hlavní nadpis</label>
                    <input type="text" value={banner.title} onChange={(e) => updateBanner(idx, 'title', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded focus:border-[#CCAD8A] outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Podtitulek / Popis</label>
                    <input type="text" value={banner.subtitle} onChange={(e) => updateBanner(idx, 'subtitle', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded focus:border-[#CCAD8A] outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Text tlačítka</label>
                    <input type="text" value={banner.buttonText} onChange={(e) => updateBanner(idx, 'buttonText', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded focus:border-[#CCAD8A] outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Odkaz tlačítka (URL)</label>
                    <input type="text" value={banner.link} onChange={(e) => updateBanner(idx, 'link', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded focus:border-[#CCAD8A] outline-none text-sm" placeholder="#/kategorie?cat=..." />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recommended Products */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-bold text-[#132333] mb-2">Doporučujeme z naší nabídky</h2>
          <p className="text-sm text-gray-500 mb-6">Vyberte produkty, které se zobrazí na domovské stránce. Pořadí odpovídá pořadí výběru.</p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {products.map(p => {
              const isSelected = settings.recommendedProducts?.includes(p.slug || String(p.id));
              return (
                <label key={p.id} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${isSelected ? 'border-[#CCAD8A] bg-[#CCAD8A]/5' : 'border-gray-100 hover:border-gray-200'}`}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleRecommended(p.slug || String(p.id))}
                    className="mt-1 w-4 h-4 text-[#CCAD8A] focus:ring-[#CCAD8A] border-gray-300 rounded"
                  />
                  <div>
                    <div className="font-semibold text-sm line-clamp-1">{p.title}</div>
                    <div className="text-xs text-gray-500">{p.category}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
