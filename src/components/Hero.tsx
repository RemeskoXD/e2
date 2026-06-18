import { imgUrl } from '../data';
import { ArrowRight, ShieldCheck, Ruler } from 'lucide-react';

export default function Hero() {
  return (
    <section className="bg-gray-50 relative overflow-hidden">
      <div className="container mx-auto px-6 py-16 md:py-24">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          <div className="w-full lg:w-1/2 relative z-10">
            <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-[#132333]/5 border border-[#132333]/10 text-[#132333] text-sm font-bold tracking-widest uppercase mb-6">
              <ShieldCheck size={16} className="text-[#CCAD8A]" />
              Záruka kvality
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-[#132333] leading-tight mb-6 tracking-tight">
              Kvalitní stínění <br className="hidden md:block"/>
              <span className="text-[#CCAD8A]">přesně na míru</span> vašeho domova
            </h1>
            <p className="text-lg text-gray-600 mb-8 leading-relaxed max-w-lg">
              Snadná online konfigurace žaluzií, rolet a sítí proti hmyzu. 
              Vyrábíme na míru z ověřených materiálů s dopravou zdarma nad 5 000 Kč.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a href="#/kategorie" className="bg-[#132333] hover:bg-[#1a3145] text-white font-bold px-8 py-4 rounded-xl transition-all transform hover:-translate-y-0.5 shadow-lg flex items-center justify-center gap-2 text-lg">
                Začít konfigurovat <ArrowRight size={20} />
              </a>
              <a href="#/mereni" className="bg-white hover:bg-gray-50 border-2 border-gray-200 text-[#132333] font-bold px-8 py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-lg">
                <Ruler size={20} className="text-[#CCAD8A]" />
                Návody na měření
              </a>
            </div>
            
            <div className="mt-10 flex items-center gap-6">
              <div className="flex -space-x-4">
                {[1,2,3,4].map((i) => (
                  <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-gray-200 shadow-sm flex items-center justify-center overflow-hidden">
                    <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="Zákazník" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
              <div className="text-sm">
                <div className="font-bold text-[#132333] flex items-center gap-1">
                  <span className="text-yellow-400">★★★★★</span> 4.9/5
                </div>
                <div className="text-gray-500">od našich zákazníků</div>
              </div>
            </div>
          </div>
          
          <div className="w-full lg:w-1/2 relative">
            {/* Background decorative blob */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[#CCAD8A]/10 rounded-full blur-3xl -z-10 hidden lg:block"></div>
            
            <div className="relative rounded-3xl overflow-hidden shadow-2xl group">
              <img 
                src={imgUrl("Venkovní stínění/Screenové rolety/tara.jpg")} 
                alt="Qapi Banner" 
                className="w-full h-[500px] object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#132333]/80 via-transparent to-transparent"></div>
              
              <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between">
                <div>
                  <div className="text-white font-bold text-xl mb-1">Moderní screenové rolety</div>
                  <div className="text-gray-300 text-sm">Ochrana před sluncem i deštěm</div>
                </div>
                <a href="#/kategorie?cat=Venkovn%C3%AD%20rolety" className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
                  <ArrowRight size={24} className="text-[#132333]" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
