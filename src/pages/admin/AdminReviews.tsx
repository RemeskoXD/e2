import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Edit2, X, Star } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminReviews() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    rating: 5,
    city: '',
    content: '',
    image_url: '',
    sort_order: 0
  });

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = () => {
    setLoading(true);
    fetch('/api/reviews')
      .then(res => res.json())
      .then(data => {
        setReviews(data);
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        toast.error('Chyba při načítání referencí');
        setLoading(false);
      });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const isEditing = editingId !== null && editingId !== 'new';
      const url = isEditing ? `/api/admin/reviews/${editingId}` : '/api/admin/reviews';
      const method = isEditing ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify(formData)
      });
      
      if (!res.ok) throw new Error('Nepodařilo se uložit referenci');
      toast.success(isEditing ? 'Reference upravena' : 'Reference přidána');
      setEditingId(null);
      fetchReviews();
    } catch (e: any) {
      toast.error(e.message || 'Chyba při ukládání');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Opravdu smazat tuto referenci?')) return;
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
      });
      if (!res.ok) throw new Error('Nepodařilo se smazat');
      toast.success('Reference smazána');
      fetchReviews();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const startEdit = (review: any) => {
    setEditingId(review.id);
    setFormData({
      name: review.name,
      rating: review.rating,
      city: review.city || '',
      content: review.content,
      image_url: review.image_url || '',
      sort_order: review.sort_order || 0
    });
  };

  const startNew = () => {
    setEditingId('new');
    setFormData({
      name: '',
      rating: 5,
      city: '',
      content: '',
      image_url: '',
      sort_order: 0
    });
  };

  if (loading) return <div className="p-8">Načítám...</div>;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-[#132333]">Reference (Hodnocení)</h1>
          <p className="text-gray-500 mt-1">Správa uživatelských recenzí na webu</p>
        </div>
        {!editingId && (
          <button
            onClick={startNew}
            className="bg-[#CCAD8A] hover:bg-[#b5997a] text-[#132333] px-6 py-3 rounded-xl font-bold transition-colors flex items-center gap-2"
          >
            <Plus size={20} />
            Přidat referenci
          </button>
        )}
      </div>

      {editingId && (
        <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8 relative">
          <button 
            type="button" 
            onClick={() => setEditingId(null)}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-800"
          >
            <X size={24} />
          </button>
          <h2 className="text-xl font-bold text-[#132333] mb-6">
            {editingId === 'new' ? 'Nová reference' : 'Úprava reference'}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Celé jméno zákazníka</label>
              <input required type="text" value={formData.name} onChange={e => setFormData(f => ({...f, name: e.target.value}))} className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Adresa / Město</label>
              <input type="text" value={formData.city} onChange={e => setFormData(f => ({...f, city: e.target.value}))} className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A]" placeholder="např. Praha" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Počet hvězdiček (1-5)</label>
              <input required type="number" min="1" max="5" value={formData.rating} onChange={e => setFormData(f => ({...f, rating: Number(e.target.value)}))} className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Pořadí</label>
              <input required type="number" value={formData.sort_order} onChange={e => setFormData(f => ({...f, sort_order: Number(e.target.value)}))} className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A]" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Obrázek (URL)</label>
              <input type="text" value={formData.image_url} onChange={e => setFormData(f => ({...f, image_url: e.target.value}))} className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A]" placeholder="https://..." />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Popisek (Text recenze)</label>
              <textarea required rows={4} value={formData.content} onChange={e => setFormData(f => ({...f, content: e.target.value}))} className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A]" />
            </div>
          </div>
          
          <button type="submit" className="bg-[#CCAD8A] hover:bg-[#b5997a] text-[#132333] px-8 py-3 rounded-xl font-bold transition-colors flex items-center gap-2">
            <Save size={20} /> Uložit
          </button>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {reviews.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Zatím nebyly přidány žádné reference.</div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Jméno</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Hodnocení</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Město</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reviews.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/50">
                  <td className="px-6 py-4 font-medium text-[#132333]">{r.name}</td>
                  <td className="px-6 py-4">
                    <div className="flex text-[#CCAD8A]">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} size={16} fill={i < r.rating ? "currentColor" : "none"} className={i >= r.rating ? "text-gray-300" : ""} />
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{r.city || '-'}</td>
                  <td className="px-6 py-4 flex justify-end gap-2">
                    <button onClick={() => startEdit(r)} className="p-2 text-gray-400 hover:text-[#CCAD8A] hover:bg-[#CCAD8A]/10 rounded-lg transition-colors">
                      <Edit2 size={18} />
                    </button>
                    <button onClick={() => handleDelete(r.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
