import { useState, useRef } from 'react';
import { Star, X, Upload } from 'lucide-react';

type ReviewModalProps = {
  productId: number;
  onClose: () => void;
  onSuccess: () => void;
};

export default function ReviewModal({ productId, onClose, onSuccess }: ReviewModalProps) {
  const [authorName, setAuthorName] = useState('');
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      const newImages = [...images];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) {
          setError('Některé soubory nejsou obrázky.');
          continue;
        }

        // Basic image compression using Canvas
        const compressedDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const MAX_WIDTH = 1200;
              const MAX_HEIGHT = 1200;
              let width = img.width;
              let height = img.height;

              if (width > height) {
                if (width > MAX_WIDTH) {
                  height *= MAX_WIDTH / width;
                  width = MAX_WIDTH;
                }
              } else {
                if (height > MAX_HEIGHT) {
                  width *= MAX_HEIGHT / height;
                  height = MAX_HEIGHT;
                }
              }

              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = reject;
            img.src = event.target?.result as string;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const uploadRes = await fetch('/api/reviews/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mimeType: 'image/jpeg',
            data: compressedDataUrl.split(',')[1] // remove data:image/jpeg;base64,
          })
        });

        const uploadData = await uploadRes.json();
        if (uploadRes.ok && uploadData.url) {
          newImages.push(uploadData.url);
        } else {
          setError(uploadData.error || 'Některé obrázky se nepodařilo nahrát.');
        }
      }
      setImages(newImages);
    } catch (err) {
      console.error(err);
      setError('Nastala chyba při nahrávání obrázků.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorName.trim()) {
      setError('Vyplňte prosím své jméno.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author_name: authorName,
          rating,
          text,
          images
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Nepodařilo se odeslat recenzi.');
      } else {
        onSuccess();
      }
    } catch (err) {
      setError('Chyba komunikace se serverem.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden my-8">
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">Napsat recenzi</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm border border-red-100">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Vaše jméno</label>
            <input
              type="text"
              required
              value={authorName}
              onChange={e => setAuthorName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CCAD8A] focus:border-[#CCAD8A] outline-none transition-all"
              placeholder="Jan Novák"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Hodnocení</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setRating(num)}
                  className="focus:outline-none transition-transform hover:scale-110"
                >
                  <Star size={32} className={num <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Slovní hodnocení (volitelné)</label>
            <textarea
              rows={4}
              value={text}
              onChange={e => setText(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CCAD8A] focus:border-[#CCAD8A] outline-none transition-all resize-none"
              placeholder="Jak jste byli s produktem spokojeni?"
            ></textarea>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Fotografie produktu (volitelné)</label>
            
            <div className="flex flex-wrap gap-3 mb-3">
              {images.map((img, i) => (
                <div key={i} className="relative w-20 h-20 group">
                  <img src={img} className="w-full h-full object-cover rounded-xl border border-gray-200" alt="Náhled" />
                  <button
                    type="button"
                    onClick={() => setImages(images.filter((_, index) => index !== i))}
                    className="absolute -top-2 -right-2 bg-white text-red-500 rounded-full shadow-md hover:bg-red-50"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-500 hover:border-[#CCAD8A] hover:text-[#CCAD8A] transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-[#CCAD8A] rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Upload size={20} className="mb-1" />
                    <span className="text-[10px] font-bold uppercase">Nahrát</span>
                  </>
                )}
              </button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageUpload}
            />
            <p className="text-xs text-gray-400">Podporované formáty: JPG, PNG. Bude automaticky zmenšeno.</p>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={submitting || uploading}
              className="flex-1 px-6 py-3 bg-[#132333] text-white font-bold rounded-xl hover:bg-[#1a3145] transition-all disabled:opacity-50"
            >
              {submitting ? 'Odesílám...' : 'Odeslat recenzi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
