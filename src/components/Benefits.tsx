import { Truck, Award, ShieldCheck, Headphones } from 'lucide-react';

export default function Benefits() {
  return (
    <div className="bg-white border-b border-gray-200">
      <div className="container mx-auto px-6">
        <div className="py-8 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-100 gap-y-8">
          <div className="flex-1 flex flex-col md:flex-row items-center gap-4 justify-center group lg:justify-start lg:pl-0">
            <div className="w-12 h-12 rounded-full bg-[#132333]/5 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Truck size={24} className="text-[#CCAD8A]" />
            </div>
            <div className="text-center md:text-left">
              <h4 className="font-bold text-[#132333] text-sm md:text-base">Doprava zdarma</h4>
              <p className="text-xs text-gray-500">Nad 5 000 Kč</p>
            </div>
          </div>
          <div className="flex-1 flex flex-col md:flex-row items-center gap-4 justify-center group pt-8 md:pt-0 lg:pl-8">
            <div className="w-12 h-12 rounded-full bg-[#132333]/5 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Award size={24} className="text-[#CCAD8A]" />
            </div>
            <div className="text-center md:text-left">
              <h4 className="font-bold text-[#132333] text-sm md:text-base">Česká výroba</h4>
              <p className="text-xs text-gray-500">Kvalita na prvním místě</p>
            </div>
          </div>
          <div className="flex-1 flex flex-col md:flex-row items-center gap-4 justify-center group pt-8 md:pt-0 lg:pl-8">
            <div className="w-12 h-12 rounded-full bg-[#132333]/5 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Headphones size={24} className="text-[#CCAD8A]" />
            </div>
            <div className="text-center md:text-left">
              <h4 className="font-bold text-[#132333] text-sm md:text-base">Odborná podpora</h4>
              <p className="text-xs text-gray-500">Vždy poradíme s výběrem</p>
            </div>
          </div>
          <div className="flex-1 flex flex-col md:flex-row items-center gap-4 justify-center group pt-8 md:pt-0 lg:pl-8">
            <div className="w-12 h-12 rounded-full bg-[#132333]/5 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <ShieldCheck size={24} className="text-[#CCAD8A]" />
            </div>
            <div className="text-center md:text-left">
              <h4 className="font-bold text-[#132333] text-sm md:text-base">Bezpečná platba</h4>
              <p className="text-xs text-gray-500">Spolehlivý nákup online</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
