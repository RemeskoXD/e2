import { useState, useEffect } from 'react';
import { Save, Database, AlertCircle, CheckCircle, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminSettings() {
  const [settings, setSettings] = useState({
    companyName: '',
    ico: '',
    dic: '',
    address: '',
    phone: '',
    email: '',
    banners: [] as any[],
    recommendedProducts: [] as string[]
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Database Diagnostics State
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [checkingDb, setCheckingDb] = useState(false);
  const [fixingDb, setFixingDb] = useState(false);
  const [fixResults, setFixResults] = useState<any>(null);

  const checkDb = async (clearResults = true) => {
    setCheckingDb(true);
    try {
      const res = await fetch('/api/admin/db-check', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
      });
      const data = await res.json();
      setDbStatus(data);
      if (clearResults) setFixResults(null);
    } catch (e: any) {
      toast.error('Nelze ověřit stav databáze');
    } finally {
      setCheckingDb(false);
    }
  };

  const fixDb = async () => {
    if (!confirm('Opravdu chcete aplikovat úpravy databáze?')) return;
    setFixingDb(true);
    try {
      const res = await fetch('/api/admin/db-fix', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
      });
      const data = await res.json();
      setFixResults(data);
      toast.success('Pokus o opravu databáze dokončen');
      checkDb(false); // Re-check after fix without clearing results
    } catch (e: any) {
      toast.error('Chyba při opravě databáze');
    } finally {
      setFixingDb(false);
    }
  };

  useEffect(() => {
    fetch('/api/store-settings')
      .then(res => res.json())
      .then(data => {
        setSettings(prev => ({ ...prev, ...data }));
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        toast.error('Chyba při načítání dat');
        setLoading(false);
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
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
      toast.success('Nastavení e-shopu úspěšně uloženo');
    } catch (e: any) {
      toast.error(e.message || 'Chyba při ukládání');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setSettings(s => ({ ...s, [field]: value }));
  };

  if (loading) return <div className="p-8">Načítám...</div>;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-[#132333]">Nastavení e-shopu</h1>
          <p className="text-gray-500 mt-1">Základní kontaktní a fakturační údaje</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 space-y-8">
          
          <section>
            <h2 className="text-xl font-bold text-[#132333] mb-4">Kontaktní údaje pro zákazníky</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Telefonní číslo</label>
                <input 
                  type="text" 
                  value={settings.phone || ''} 
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="+420 774 060 193"
                  className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                />
                <p className="text-xs text-gray-500 mt-1">Zobrazí se v hlavičce a patičce webu.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">E-mail</label>
                <input 
                  type="email" 
                  value={settings.email || ''} 
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="info@qapi.cz"
                  className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                />
                <p className="text-xs text-gray-500 mt-1">Hlavní kontaktní e-mail.</p>
              </div>
            </div>
          </section>

          <hr className="border-gray-100" />

          <section>
            <h2 className="text-xl font-bold text-[#132333] mb-4">Fakturační údaje firmy</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Název firmy / Společnosti</label>
                <input 
                  type="text" 
                  value={settings.companyName || ''} 
                  onChange={(e) => handleChange('companyName', e.target.value)}
                  placeholder="Qapi s.r.o."
                  className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">IČO</label>
                  <input 
                    type="text" 
                    value={settings.ico || ''} 
                    onChange={(e) => handleChange('ico', e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">DIČ (pokud jste plátci)</label>
                  <input 
                    type="text" 
                    value={settings.dic || ''} 
                    onChange={(e) => handleChange('dic', e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Adresa sídla (ulice, PSČ, město)</label>
                <input 
                  type="text" 
                  value={settings.address || ''} 
                  onChange={(e) => handleChange('address', e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                />
              </div>
            </div>
          </section>
        </div>
        
        <div className="bg-gray-50 p-6 md:p-8 border-t border-gray-100 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#CCAD8A] hover:bg-[#b5997a] text-[#132333] px-8 py-3 rounded-xl font-bold transition-colors flex items-center gap-2"
          >
            <Save size={20} />
            {saving ? 'Ukládám...' : 'Uložit nastavení'}
          </button>
        </div>
      </form>

      <div className="mt-12 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 md:p-8">
          <div className="flex items-center gap-3 mb-4">
            <Database className="text-gray-500" />
            <h2 className="text-xl font-bold text-[#132333]">Diagnostika databáze</h2>
          </div>
          <p className="text-gray-600 mb-6 text-sm">
            Nástroj pro ověření, zda produkční databáze obsahuje všechny potřebné tabulky a sloupce. 
            V případě problému s ukládáním produktů můžete zkusit databázi opravit jedním kliknutím.
          </p>

          <div className="flex flex-wrap gap-4 mb-6">
            <button 
              onClick={checkDb}
              disabled={checkingDb}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-6 py-2.5 rounded-lg font-semibold transition-colors"
            >
              {checkingDb ? 'Kontroluji...' : 'Zkontrolovat stav databáze'}
            </button>
            <button 
              onClick={fixDb}
              disabled={fixingDb}
              className="bg-[#132333] hover:bg-[#1a2f4c] text-white px-6 py-2.5 rounded-lg font-semibold transition-colors flex items-center gap-2"
            >
              <Wrench size={16} />
              {fixingDb ? 'Opravuji...' : 'Aplikovat opravy struktury'}
            </button>
          </div>

          {dbStatus && (
            <div className={`p-4 rounded-lg mb-6 border ${dbStatus.status === 'ok' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-start gap-3">
                {dbStatus.status === 'ok' ? (
                  <CheckCircle className="text-green-600 mt-0.5" size={20} />
                ) : (
                  <AlertCircle className="text-red-600 mt-0.5" size={20} />
                )}
                <div>
                  <h3 className={`font-bold ${dbStatus.status === 'ok' ? 'text-green-800' : 'text-red-800'}`}>
                    {dbStatus.status === 'ok' ? 'Databáze je v pořádku' : 'Byly nalezeny chybějící prvky'}
                  </h3>
                  
                  {dbStatus.missing?.tables?.length > 0 && (
                    <div className="mt-2 text-sm text-red-700">
                      <strong>Chybějící tabulky:</strong> {dbStatus.missing.tables.join(', ')}
                    </div>
                  )}
                  {dbStatus.missing?.columns?.length > 0 && (
                    <div className="mt-2 text-sm text-red-700">
                      <strong>Chybějící sloupce:</strong> {dbStatus.missing.columns.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {fixResults && (
            <div className="mt-6">
              <h3 className="font-bold mb-2">Výsledek opravy:</h3>
              <div className="bg-gray-900 text-gray-300 p-4 rounded-lg text-sm font-mono overflow-auto max-h-60 space-y-1">
                {fixResults.results?.map((r: string, i: number) => <div key={i} className="text-green-400">{r}</div>)}
                {fixResults.errors?.map((e: string, i: number) => <div key={i} className="text-red-400">{e}</div>)}
                {(!fixResults.results?.length && !fixResults.errors?.length) && <div>Žádná akce nebyla provedena.</div>}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
