import { MapPin, Phone, Mail, Building, FileText, CheckCircle2 } from 'lucide-react';

export default function Kontakt() {
  return (
    <div className="flex-grow bg-[#F6F8F9] py-16 md:py-24">
      <div className="container mx-auto px-6">
        
        {/* Header Sekce */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-extrabold text-[#132333] tracking-tight mb-6">
            Kontakt
          </h1>
          <p className="text-lg text-gray-500 leading-relaxed">
            Jsme tu pro vás. Máte dotaz k produktům, potřebujete poradit se zaměřením 
            nebo chcete probrat větší realizaci? Neváhejte se na nás obrátit.
          </p>
        </div>

        {/* Mřížka Kontaktů */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          
          {/* Levý panel: Spojení */}
          <div className="bg-white rounded-2xl p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/50">
            <h2 className="text-2xl font-bold text-[#132333] mb-8">Zákaznická podpora</h2>
            
            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-[#CCAD8A]/10 rounded-full flex items-center justify-center text-[#CCAD8A] shrink-0">
                  <Phone size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Telefon</h3>
                  <a href="tel:+420774060193" className="text-xl font-bold text-[#132333] hover:text-[#CCAD8A] transition-colors">
                    +420 774 060 193
                  </a>
                  <p className="text-sm text-gray-500 mt-1">Po - Pá: 8:00 - 16:00</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 bg-[#CCAD8A]/10 rounded-full flex items-center justify-center text-[#CCAD8A] shrink-0">
                  <Mail size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">E-mail</h3>
                  <a href="mailto:info@qapi.cz" className="text-xl font-bold text-[#132333] hover:text-[#CCAD8A] transition-colors">
                    info@qapi.cz
                  </a>
                  <p className="text-sm text-gray-500 mt-1">Odpovíme vám co nejdříve.</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-[#CCAD8A]/10 rounded-full flex items-center justify-center text-[#CCAD8A] shrink-0">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Odborné poradenství</h3>
                  <p className="text-base font-semibold text-[#132333]">
                    Nejste si jistí výběrem nebo zaměřením? 
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Náš tým prémiové podpory vás navede.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Pravý panel: Firemní údaje */}
          <div className="bg-[#132333] text-white rounded-2xl p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <h2 className="text-2xl font-bold text-white mb-8">Fakturační údaje</h2>
            
            <div className="space-y-6">
              <div className="flex gap-4 items-start">
                <Building size={20} className="text-[#CCAD8A] shrink-0 mt-1" />
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Obchodní firma</h3>
                  <p className="text-lg font-bold">Ropemi s.r.o.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <MapPin size={20} className="text-[#CCAD8A] shrink-0 mt-1" />
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Sídlo</h3>
                  <p className="text-base text-gray-200">
                    Varšavská 715/36<br/>
                    Vinohrady<br/>
                    120 00 Praha 2
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-white/10">
                <div className="flex gap-3 items-center">
                  <FileText size={18} className="text-[#CCAD8A]" />
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">IČO</h3>
                    <p className="font-semibold">22333941</p>
                  </div>
                </div>
                
                <div className="flex gap-3 items-center">
                  <FileText size={18} className="text-[#CCAD8A]" />
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">DIČ</h3>
                    <p className="font-semibold">CZ22333941</p>
                  </div>
                </div>
              </div>
              
              <div className="pt-2 text-sm text-gray-400">
                  <span className="inline-flex items-center gap-1"><CheckCircle2 size={14} className="text-[#CCAD8A]"/> Plátce DPH: Ano</span>
              </div>
            </div>
          </div>

        </div>

        <div className="max-w-3xl mx-auto mt-16 text-center text-sm text-gray-600">
          <p>
            Dokumenty pro zákazníky:{' '}
            <a href="#/obchodni-podminky" className="text-[#CCAD8A] font-semibold hover:underline">
              obchodní podmínky
            </a>
            ,{' '}
            <a href="#/ochrana-udaju" className="text-[#CCAD8A] font-semibold hover:underline">
              ochrana osobních údajů
            </a>
            ,{' '}
            <a href="#/odstoupeni" className="text-[#CCAD8A] font-semibold hover:underline">
              odstoupení od smlouvy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
