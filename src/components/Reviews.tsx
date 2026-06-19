import { useEffect, useState } from 'react';
import { Star, MapPin } from 'lucide-react';

export default function Reviews() {
  const [reviews, setReviews] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/reviews')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setReviews(data);
        }
      })
      .catch(console.error);
  }, []);

  if (reviews.length === 0) return null;

  return (
    <section className="bg-[#132333] py-16 lg:py-24 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#CCAD8A]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
      
      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-4">Hodnocení od našich zákazníků</h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Zakládáme si na precizní kvalitě a perfektním servisu. Přečtěte si, co o nás říkají ti, kteří už doma mají naše stínění.
          </p>
        </div>

        <div className="flex overflow-x-auto pb-8 gap-6 snap-x snap-mandatory scrollbar-hide -mx-6 px-6 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-3 lg:overflow-visible">
          {reviews.map(review => (
            <div 
              key={review.id} 
              className="min-w-[300px] sm:min-w-[350px] lg:min-w-0 flex-shrink-0 snap-center bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-colors"
            >
              <div className="flex gap-1 text-[#CCAD8A] mb-6">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={18} fill={i < review.rating ? "currentColor" : "none"} className={i >= review.rating ? "text-gray-600" : ""} />
                ))}
              </div>
              
              <p className="text-gray-300 italic mb-8 leading-relaxed">"{review.content}"</p>
              
              <div className="flex items-center gap-4 mt-auto">
                {review.image_url ? (
                  <img src={review.image_url} alt={review.name} className="w-12 h-12 rounded-full object-cover border-2 border-[#CCAD8A]" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[#1a3145] text-[#CCAD8A] flex items-center justify-center font-bold text-lg border-2 border-[#CCAD8A]/50">
                    {review.name.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="font-bold text-white">{review.name}</div>
                  {review.city && (
                    <div className="flex items-center gap-1 text-sm text-gray-400 mt-0.5">
                      <MapPin size={12} /> {review.city}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
