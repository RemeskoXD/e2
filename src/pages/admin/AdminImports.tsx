import React, { useState } from 'react';
import { Terminal } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminImports() {
  const [loading, setLoading] = useState(false);

  const handleImport = async (endpoint: string, name: string) => {
    if (!window.confirm(`Spustit hromadný import pro: ${name}?`)) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('adminToken') || '';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success(`Import produktu ${name} proběhl úspěšně!`);
      } else {
        const err = await res.json();
        toast.error(`Chyba při importu: ${err.error || 'Neznámá chyba'}`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#132333]">Hromadné importy</h1>
          <p className="text-gray-500 mt-1">
            Zde můžete jedním kliknutím do databáze vygenerovat předpřipravené produkty (včetně kompletních ceníkových matic).
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xl font-bold text-[#132333] mb-6">Dostupné importy</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <div className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
            <h3 className="font-bold text-lg text-gray-800 mb-2">Horizontální žaluzie ISOLINE</h3>
            <p className="text-sm text-gray-600 mb-6">Základní provedení, max. plocha 2.4 m²</p>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleImport('/api/admin/import-isoline', 'ISOLINE')}
              className="w-full bg-[#132333] hover:bg-[#1f3a53] disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2"
            >
              <Terminal size={18} />
              Spustit import
            </button>
          </div>

          <div className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
            <h3 className="font-bold text-lg text-gray-800 mb-2">Horizontální žaluzie ISOLINE PRIM</h3>
            <p className="text-sm text-gray-600 mb-6">Včetně provedení s převodovkou, max. plocha 5.28 m²</p>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleImport('/api/admin/import-isoline-prim', 'ISOLINE PRIM')}
              className="w-full bg-[#CCAD8A] hover:bg-[#b5997a] disabled:opacity-50 text-[#132333] font-bold px-4 py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2"
            >
              <Terminal size={18} />
              Spustit import
            </button>
          </div>

          <div className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
            <h3 className="font-bold text-lg text-gray-800 mb-2">Textilní roletka Optima</h3>
            <p className="text-sm text-gray-600 mb-6">Roletka s krytem návinu a vodícími lištami, složitá logika limitů látek.</p>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleImport('/api/admin/import-optima', 'Textilní roletka Optima')}
              className="w-full bg-[#132333] hover:bg-[#1f3a53] disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2"
            >
              <Terminal size={18} />
              Spustit import
            </button>
          </div>

          <div className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
            <h3 className="font-bold text-lg text-gray-800 mb-2">Textilní roletka Optima Den a noc</h3>
            <p className="text-sm text-gray-600 mb-6">Varianta Den a noc s logikou limitů vázanou přímo na konkrétní látku.</p>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleImport('/api/admin/import-optima-den-noc', 'Textilní roletka Optima Den a noc')}
              className="w-full bg-[#132333] hover:bg-[#1f3a53] disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2"
            >
              <Terminal size={18} />
              Spustit import
            </button>
          </div>

          <div className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
            <h3 className="font-bold text-lg text-gray-800 mb-2">Plisé žaluzie Lagarta</h3>
            <p className="text-sm text-gray-600 mb-6">Naprostý gigant. Pět cenových matic pro 5 skupin látek, složitá logika a limity pro každý model z 12 dostupných.</p>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleImport('/api/admin/import-plise-lagarta', 'Plisé žaluzie Lagarta')}
              className="w-full bg-[#CCAD8A] hover:bg-[#b5997a] disabled:opacity-50 text-[#132333] font-bold px-4 py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2"
            >
              <Terminal size={18} />
              Spustit obří import
            </button>
          </div>

          <div className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
            <h3 className="font-bold text-lg text-gray-800 mb-2">Okenní sítě proti hmyzu</h3>
            <p className="text-sm text-gray-600 mb-6">Univerzální okenní sítě s výběrem profilu dle typu okna (PVC, EURO, Hliník) a širokým výběrem síťovin.</p>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleImport('/api/admin/import-site-hmyz', 'Okenní sítě proti hmyzu')}
              className="w-full bg-[#132333] hover:bg-[#1f3a53] disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2"
            >
              <Terminal size={18} />
              Spustit import
            </button>
          </div>

          <div className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
            <h3 className="font-bold text-lg text-gray-800 mb-2">Dveřní sítě proti hmyzu</h3>
            <p className="text-sm text-gray-600 mb-6">Dveřní sítě v provedení bez rámu (DE 50x20) nebo s rámem (DE 40x20 Lux + R3/R4).</p>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleImport('/api/admin/import-dverni-site', 'Dveřní sítě proti hmyzu')}
              className="w-full bg-[#132333] hover:bg-[#1f3a53] disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2"
            >
              <Terminal size={18} />
              Spustit import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
