import { Truck, Award, Headphones, ShieldCheck } from 'lucide-react';

export default function Benefits() {
  return (
    <div className="relative z-20 -mt-10 sm:-mt-16 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] py-6 px-6 sm:px-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-4">
          
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#CCAD8A]/10 flex items-center justify-center shrink-0">
              <Truck size={22} className="text-[#132333]" strokeWidth={2} />
            </div>
            <div>
              <h4 className="font-extrabold text-[#132333] text-sm md:text-[15px]">Doprava zdarma</h4>
              <p className="text-[13px] text-gray-500 mt-0.5">Od 5 000 Kč</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#CCAD8A]/10 flex items-center justify-center shrink-0">
              <Award size={22} className="text-[#132333]" strokeWidth={2} />
            </div>
            <div>
              <h4 className="font-extrabold text-[#132333] text-sm md:text-[15px]">Certifikovaný dodavatel</h4>
              <p className="text-[13px] text-gray-500 mt-0.5">Oficiální partner</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#CCAD8A]/10 flex items-center justify-center shrink-0">
              <Headphones size={22} className="text-[#132333]" strokeWidth={2} />
            </div>
            <div>
              <h4 className="font-extrabold text-[#132333] text-sm md:text-[15px]">Odborná podpora</h4>
              <p className="text-[13px] text-gray-500 mt-0.5">Vždy k dispozici</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#CCAD8A]/10 flex items-center justify-center shrink-0">
              <ShieldCheck size={22} className="text-[#132333]" strokeWidth={2} />
            </div>
            <div>
              <h4 className="font-extrabold text-[#132333] text-sm md:text-[15px]">Kvalitní materiály</h4>
              <p className="text-[13px] text-gray-500 mt-0.5">Které dlouho vydrží</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
