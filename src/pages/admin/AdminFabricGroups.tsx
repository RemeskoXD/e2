import { useState, useEffect, type FormEvent } from 'react';
import { Plus, Edit2, Trash2, X, Palette, DollarSign, Upload } from 'lucide-react';
import { uploadImage } from '../../lib/imageHelpers';

interface FabricColor {
  id: string;
  name: string;
  hex?: string;
  img?: string;
}

interface FabricGroup {
  id?: number;
  name: string;
  surcharge: number;
  colors: FabricColor[];
}

export default function AdminFabricGroups() {
  const [groups, setGroups] = useState<FabricGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<FabricGroup>>({
    name: '', surcharge: 0, colors: []
  });

  const fetchGroups = async () => {
    setFetchError(null);
    try {
      const res = await fetch('/api/fabric-groups');
      const data = await res.json();
      if (!res.ok) {
        setGroups([]);
        setFetchError(data?.error || 'Nepodařilo se načíst skupiny látek.');
        return;
      }
      setGroups(data);
    } catch {
      setGroups([]);
      setFetchError('Nelze se spojit se serverem.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleOpenModal = (g?: FabricGroup) => {
    if (g) {
      setEditingId(g.id!);
      setFormData({ 
        name: g.name, 
        surcharge: Number(g.surcharge), 
        colors: g.colors || [] 
      });
    } else {
      setEditingId(null);
      setFormData({ name: '', surcharge: 0, colors: [] });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) return alert('Chybí admin token');

    try {
      const url = editingId ? `/api/admin/fabric-groups/${editingId}` : '/api/admin/fabric-groups';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        await fetchGroups();
        handleCloseModal();
      } else {
        const d = await res.json();
        alert(d.error || 'Chyba při ukládání');
      }
    } catch (err) {
      alert('Chyba spojení.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Opravdu smazat tuto skupinu?')) return;
    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) return alert('Chybí admin token');
    try {
      const res = await fetch(`/api/admin/fabric-groups/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.ok) {
        await fetchGroups();
      } else {
        alert('Chyba při mazání');
      }
    } catch (err) {
      alert('Chyba spojení');
    }
  };

  const addColor = () => {
    setFormData(prev => ({
      ...prev,
      colors: [...(prev.colors || []), { id: Date.now().toString(), name: 'Nová barva', hex: '#000000' }]
    }));
  };

  const updateColor = (id: string, updates: Partial<FabricColor>) => {
    setFormData(prev => ({
      ...prev,
      colors: (prev.colors || []).map(c => c.id === id ? { ...c, ...updates } : c)
    }));
  };

  const removeColor = (id: string) => {
    setFormData(prev => ({
      ...prev,
      colors: (prev.colors || []).filter(c => c.id !== id)
    }));
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Skupiny látek a barvy</h1>
          <p className="text-gray-500 mt-1">Nastavení barevných palet a příplatků podle skupin.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-[#132333] text-white rounded-lg hover:bg-[#1a2e44] transition-colors"
        >
          <Plus size={20} />
          <span>Nová skupina</span>
        </button>
      </div>

      {fetchError && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6">
          {fetchError}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">Načítání skupin...</div>
      ) : groups.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl p-8 text-center text-gray-500">
          Zatím nejsou vytvořeny žádné skupiny látek.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-100">
                  <th className="py-4 px-6 font-semibold">Název skupiny</th>
                  <th className="py-4 px-6 font-semibold">Příplatek za m² (Kč)</th>
                  <th className="py-4 px-6 font-semibold">Počet barev</th>
                  <th className="py-4 px-6 font-semibold text-right">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-[#132333] font-medium text-sm">
                {groups.map((group) => (
                  <tr key={group.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6 font-bold">{group.name}</td>
                    <td className="py-4 px-6 text-gray-600">{Number(group.surcharge).toLocaleString("cs-CZ")} Kč/m²</td>
                    <td className="py-4 px-6 text-gray-600">{group.colors?.length || 0}</td>
                    <td className="py-4 px-6 text-right space-x-2">
                      <button
                        onClick={() => handleOpenModal(group)}
                        className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Upravit"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(group.id!)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Smazat"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal pro Skupinu */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 shrink-0">
              <h2 className="text-xl font-bold text-gray-900">
                {editingId ? 'Upravit skupinu' : 'Nová skupina'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6 flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Název skupiny</label>
                  <input
                    required
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Příplatek za m² (Kč)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                      <DollarSign size={18} />
                    </span>
                    <input
                      required
                      type="number"
                      step="0.01"
                      value={formData.surcharge || ''}
                      onChange={(e) => setFormData({ ...formData, surcharge: Number(e.target.value) })}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-sm font-semibold text-gray-700">Paleta barev</label>
                  <button
                    type="button"
                    onClick={addColor}
                    className="text-sm font-medium text-[#CCAD8A] hover:text-[#b89b7c] flex items-center gap-1"
                  >
                    <Plus size={16} />
                    Přidat barvu
                  </button>
                </div>
                
                <div className="space-y-3">
                  {formData.colors?.map(color => (
                    <div key={color.id} className="flex gap-3 items-center p-3 border border-gray-100 rounded-xl bg-gray-50/50">
                      <input
                        type="color"
                        value={color.hex || '#000000'}
                        onChange={(e) => updateColor(color.id, { hex: e.target.value })}
                        className="w-10 h-10 rounded shrink-0 cursor-pointer border border-gray-200"
                        title="Vybrat barvu"
                      />
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Název barvy"
                          value={color.name}
                          onChange={(e) => updateColor(color.id, { name: e.target.value })}
                          className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A]"
                        />
                      </div>
                      <div className="flex-1 flex gap-2 items-center">
                          <input
                            type="text"
                            placeholder="URL obrázku (volitelné)"
                            value={color.img || ''}
                            onChange={(e) => updateColor(color.id, { img: e.target.value })}
                            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A]"
                          />
                          <label className="shrink-0 flex items-center justify-center p-2 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors bg-white text-gray-500" title="Nahrát obrázek">
                            <Upload size={18} />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                try {
                                  const url = await uploadImage(file);
                                  updateColor(color.id, { img: url });
                                } catch (err) {
                                  console.error(err);
                                  alert("Chyba při nahrávání obrázku.");
                                }
                              }}
                            />
                          </label>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeColor(color.id)}
                        className="p-2 text-red-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"
                        title="Odebrat barvu"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                  {(!formData.colors || formData.colors.length === 0) && (
                    <div className="text-sm text-gray-400 p-4text-center bg-gray-50 rounded-xl border border-gray-100 border-dashed">
                      Žádné barvy nejsou přiřazeny.
                    </div>
                  )}
                </div>
              </div>
            </form>

            <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-6 py-2.5 font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Storno
              </button>
              <button
                onClick={(e) => handleSubmit(e)}
                className="px-6 py-2.5 font-medium text-white bg-[#132333] rounded-lg hover:bg-[#1a2e44] transition-colors"
              >
                Uložit skupinu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
