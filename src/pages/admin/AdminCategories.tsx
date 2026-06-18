import { useState, useEffect, type FormEvent } from 'react';
import { Plus, Edit2, Trash2, X, Terminal, ChevronDown, ChevronRight } from 'lucide-react';
import { CENIK_IMPORT_COMMANDS } from '../../lib/cenikImportCommands';
import { uploadImage } from '../../lib/imageHelpers';

interface Category {
  id?: number;
  name: string;
  count: string;
  img: string;
}

export default function AdminCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [importHelpOpen, setImportHelpOpen] = useState(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<Category>>({
    name: '', count: '', img: ''
  });

  const fetchCategories = async () => {
    setFetchError(null);
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      if (!res.ok) {
        setCategories([]);
        setFetchError(typeof data?.error === 'string' ? data.error : 'Nepodařilo se načíst kategorie.');
        return;
      }
      if (Array.isArray(data)) {
        setCategories(data.filter((c: Category & { name?: string }) => c && c.name));
      } else {
        setCategories([]);
        setFetchError('Odpověď serveru není seznam kategorií.');
      }
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

  const handleOpenModal = (category?: Category) => {
    if (category) {
      setEditingId(category.id || null);
      setFormData({
        name: category.name,
        count: category.count,
        img: category.img
      });
    } else {
      setEditingId(null);
      setFormData({ name: '', count: '', img: '' });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('adminToken');
    if (!token) return alert('No admin token');

    try {
      const url = editingId ? `/api/admin/categories/${editingId}` : '/api/admin/categories';
      const method = editingId ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      
      if (res.ok) {
        handleCloseModal();
        fetchCategories(); // refresh
      } else {
        alert('Chyba při ukládání kategorie');
      }
    } catch (err) {
      alert('Chyba serveru');
    }
  };

  const handleDelete = async (id?: number) => {
    if (!id) return alert('Nelze smazat předvyplněná data');
    if (!confirm('Opravdu smazat tuto kategorii?')) return;
    const token = localStorage.getItem('adminToken');
    if (!token) return alert('No admin token');

    try {
      const res = await fetch(`/api/admin/categories/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchCategories();
      } else {
        alert('Chyba při mazání');
      }
    } catch {
      alert('Chyba serveru');
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Načítám kategorie...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[#132333]">Kategorie stínění</h1>
          <p className="text-gray-500 mt-1">Data z databáze. Produkty se doplňují importy v sekci Produkty.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setImportHelpOpen((o) => !o)}
            className="bg-white border border-gray-200 text-[#132333] hover:bg-gray-50 font-bold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <Terminal size={18} />
            Import (npm)
            {importHelpOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
          <button onClick={() => handleOpenModal()} className="bg-[#CCAD8A] hover:bg-[#b5997a] text-[#132333] font-bold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2">
            <Plus size={18} />
            Nová kategorie
          </button>
        </div>
      </div>

      {importHelpOpen && (
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-600 mb-3">Importy produktů (stejné jako u produktů):</p>
          <ul className="space-y-1 text-sm font-mono text-[#132333]">
            {CENIK_IMPORT_COMMANDS.map((row) => (
              <li key={row.command}>{row.command}</li>
            ))}
          </ul>
        </div>
      )}

      {fetchError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {fetchError}
        </div>
      )}

      {!fetchError && categories.length === 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Žádné kategorie v databázi — přidejte je tlačítkem „Nová kategorie“.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {categories.map((cat, idx) => (
          <div key={cat.id ?? `cat-${cat.name}-${idx}`} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col group">
            <div className="w-16 h-16 rounded-xl overflow-hidden mb-4 border border-gray-100">
               <img src={cat.img} alt={cat.name} className="w-full h-full object-cover" />
            </div>
            <h3 className="text-xl font-bold text-[#132333] mb-1">{cat.name}</h3>
            <p className="text-sm text-gray-500 mb-6">{cat.count}</p>
            
            <div className="mt-auto flex gap-2 pt-4 border-t border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => handleOpenModal(cat)} className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold text-sm rounded-lg transition-colors">
                <Edit2 size={16} /> Upravit
              </button>
              <button onClick={() => handleDelete(cat.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg border border-transparent hover:border-red-100 hover:bg-red-50">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-[#132333]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 p-6 flex justify-between items-center z-10">
              <h2 className="text-xl font-bold text-[#132333]">
                {editingId ? 'Upravit kategorii' : 'Nová kategorie'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-[#132333] transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Název kategorie</label>
                <input required
                  type="text" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Popisek (např. 14 produktů)</label>
                <input required
                  type="text" 
                  value={formData.count} 
                  onChange={e => setFormData({...formData, count: e.target.value})}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Obrázek (URL nebo nahrát)</label>
                <div className="flex gap-2">
                  <input required
                    type="text" 
                    value={formData.img} 
                    onChange={e => setFormData({...formData, img: e.target.value})}
                    placeholder="https://..."
                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                  />
                  <label className="cursor-pointer bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center font-medium shadow-sm whitespace-nowrap">
                    Nahrát
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const url = await uploadImage(file);
                          setFormData(prev => ({ ...prev, img: url }));
                        } catch (err) {
                          console.error(err);
                          alert("Chyba při nahrávání obrázku.");
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                <button 
                  type="button" 
                  onClick={handleCloseModal}
                  className="px-6 py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Zrušit
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2.5 rounded-xl font-bold bg-[#132333] hover:bg-[#1a3047] text-white transition-colors"
                >
                  Uložit kategorii
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
