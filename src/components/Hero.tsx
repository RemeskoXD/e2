import { useState, useEffect } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';

interface Banner {
  id: string;
  image: string;
  title: string;
  subtitle: string;
  buttonText: string;
  link: string;
}

export default function Hero() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    fetch('/api/store-settings')
      .then(res => res.json())
      .then(data => {
        if (data.banners && data.banners.length > 0) {
          setBanners(data.banners);
        }
      })
      .catch(console.error);
  }, []);

  // Auto-advance carousel
  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [banners.length]);

  if (banners.length === 0) {
    return null; // Don't show anything if no banners exist yet.
  }

  const nextBanner = () => setCurrentIndex((prev) => (prev + 1) % banners.length);
  const prevBanner = () => setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);

  return (
    <section className="relative overflow-hidden bg-[#132333]">
      {/* Banner Display */}
      <div className="relative h-[300px] md:h-[380px] lg:h-[450px] w-full">
        {banners.map((banner, idx) => (
          <div
            key={banner.id || idx}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              idx === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
            }`}
          >
            <div className="absolute inset-0 bg-black/40 z-10"></div>
            <img 
              src={banner.image} 
              alt={banner.title} 
              className="w-full h-full object-cover"
            />
            
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center px-4">
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-white mb-4 drop-shadow-md max-w-4xl tracking-tight">
                {banner.title}
              </h1>
              {banner.subtitle && (
                <p className="text-lg md:text-xl text-gray-200 mb-8 max-w-2xl drop-shadow-sm font-medium">
                  {banner.subtitle}
                </p>
              )}
              {banner.buttonText && (
                <a 
                  href={banner.link || '#'} 
                  className="bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-bold px-8 py-4 rounded-xl transition-all transform hover:-translate-y-0.5 shadow-lg flex items-center justify-center gap-2 text-lg"
                >
                  {banner.buttonText} <ArrowRight size={20} />
                </a>
              )}
            </div>
          </div>
        ))}

        {/* Carousel Controls */}
        {banners.length > 1 && (
          <>
            <button 
              onClick={prevBanner}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 bg-white/10 hover:bg-white/30 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
            <button 
              onClick={nextBanner}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 bg-white/10 hover:bg-white/30 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-colors"
            >
              <ChevronRight size={24} />
            </button>
            
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex gap-2">
              {banners.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-3 h-3 rounded-full transition-all ${
                    idx === currentIndex ? 'bg-[#CCAD8A] w-8' : 'bg-white/50 hover:bg-white'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
