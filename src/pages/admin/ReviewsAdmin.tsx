import { useEffect, useState, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { Star, CheckCircle, XCircle, Trash2, Search, ExternalLink } from 'lucide-react';

type AdminReview = {
  id: number;
  product_id: number;
  product_title: string;
  author_name: string;
  rating: number;
  text?: string;
  images?: string[];
  approved: boolean;
  created_at: string;
};

export default function ReviewsAdmin() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/reviews', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });
      if (res.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      if (!res.ok) throw new Error('Nepodařilo se načíst recenze');
      const data = await res.json();
      setReviews(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const handleApprove = async (id: number, approved: boolean) => {
    try {
      const res = await fetch(`/api/admin/reviews/${id}/approve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify({ approved })
      });
      if (!res.ok) throw new Error('Nepodařilo se změnit stav schválení');
      setReviews(reviews.map(r => r.id === id ? { ...r, approved } : r));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Opravdu chcete tuto recenzi trvale smazat?')) return;
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });
      if (!res.ok) throw new Error('Nepodařilo se smazat recenzi');
      setReviews(reviews.filter(r => r.id !== id));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filteredReviews = reviews.filter(r => 
    r.author_name.toLowerCase().includes(search.toLowerCase()) || 
    r.product_title.toLowerCase().includes(search.toLowerCase()) ||
    (r.text && r.text.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) {
    return <div className="p-8 text-gray-500">Načítám recenze...</div>;
  }

  return (
    <div className="space-y-6">
      <Helmet>
        <title>Správa recenzí | Administrace</title>
      </Helmet>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Správa recenzí</h1>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Hledat v recenzích..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none w-full sm:w-64"
          />
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100">
          {error}
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <Star size={24} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Žádné recenze nenalezeny</h3>
          <p className="text-gray-500">Zatím nemáte žádné recenze nebo nevyhovují vyhledávání.</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {filteredReviews.map(review => (
            <div key={review.id} className={`bg-white rounded-2xl shadow-sm border ${review.approved ? 'border-gray-100' : 'border-amber-200 bg-amber-50/10'} p-6 transition-colors`}>
              <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-bold text-gray-900 text-lg">{review.author_name}</span>
                    <span className="text-sm text-gray-500">{new Date(review.created_at).toLocaleString('cs-CZ')}</span>
                    {!review.approved && (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold uppercase tracking-wide">
                        Čeká na schválení
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4 mb-3">
                    <div className="flex text-yellow-400">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} size={16} className={i < review.rating ? "fill-current" : "text-gray-200"} />
                      ))}
                    </div>
                    <a 
                      href={`/produkt/${review.product_id}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      {review.product_title} <ExternalLink size={14} />
                    </a>
                  </div>
                  
                  {review.text && (
                    <p className="text-gray-700 bg-gray-50 p-4 rounded-xl text-sm italic mb-4">
                      "{review.text}"
                    </p>
                  )}
                  
                  {review.images && review.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {review.images.map((img, i) => (
                        <a key={i} href={img} target="_blank" rel="noreferrer" className="block">
                          <img src={img} alt="Přiložená fotka" className="w-20 h-20 object-cover rounded-lg border border-gray-200 hover:border-blue-500 transition-colors" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="flex sm:flex-col gap-2 shrink-0">
                  {review.approved ? (
                    <button
                      onClick={() => handleApprove(review.id, false)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors"
                      title="Skrýt recenzi na webu"
                    >
                      <XCircle size={18} /> Skrýt
                    </button>
                  ) : (
                    <button
                      onClick={() => handleApprove(review.id, true)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white font-medium rounded-xl hover:bg-green-600 transition-colors shadow-sm shadow-green-500/20"
                      title="Zobrazit recenzi na webu"
                    >
                      <CheckCircle size={18} /> Schválit
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(review.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-red-200 text-red-600 font-medium rounded-xl hover:bg-red-50 hover:border-red-300 transition-colors"
                  >
                    <Trash2 size={18} /> Smazat
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
