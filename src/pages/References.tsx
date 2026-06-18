import React from 'react';
import { Star, MapPin } from 'lucide-react';
import { referencesData } from '../data';

export default function References() {
  return (
    <div className="flex-grow bg-[#F6F8F9] py-16 md:py-24">
      <div className="container mx-auto px-6">
        
        {/* Header Sekce */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-extrabold text-[#132333] tracking-tight mb-6">
            Reference a realizace
          </h1>
          <p className="text-lg text-gray-500 leading-relaxed">
            Prohlédněte si naše skutečné realizace u zákazníků. 
            Prémiové stínění instalované s milimetrovou přesností po celé České republice.
          </p>
        </div>

        {/* Mřížka Referencí */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 px-0 sm:px-4">
          {referencesData.map((ref) => (
            <div 
              key={ref.id} 
              className="bg-white rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/50 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 flex flex-col h-full group"
            >
              
              {/* Textový obsah nahoře (podle skici) */}
              <div className="p-8 flex flex-col flex-1">
                <h3 className="text-xl font-bold text-[#132333] mb-2">{ref.title}</h3>
                
                {/* Hvězdičky */}
                <div className="flex items-center space-x-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star 
                      key={i} 
                      size={18} 
                      className={i < ref.stars ? "fill-[#F5A623] text-[#F5A623]" : "fill-gray-200 text-gray-200"} 
                    />
                  ))}
                  <span className="font-bold text-2xl text-[#132333] ml-3 leading-none">{ref.stars}/5</span>
                </div>

                {/* Produkt a Lokalita */}
                <div className="flex flex-col space-y-2 mb-5">
                  <span className="text-sm font-semibold text-[#132333]">{ref.productName}</span>
                  <div className="flex items-center text-sm text-gray-400">
                    <MapPin size={14} className="mr-1.5" />
                    {ref.location}
                  </div>
                </div>

                {/* Recenze text */}
                <p className="text-gray-600 text-sm leading-relaxed relative flex-1">
                  "{ref.text}"
                </p>
              </div>

              {/* Fotografie dole (podle skici) s Tag-em */}
              <div className="relative h-64 w-full bg-gray-100 overflow-hidden">
                {/* Tag plovoucí nad fotkou vlevo nahoře */}
                <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded text-[10px] font-bold tracking-widest uppercase text-[#132333] z-10 shadow-sm">
                  {ref.tag}
                </div>
                
                <img 
                  src={ref.img} 
                  alt={ref.title} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-in-out"
                />
              </div>

            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
