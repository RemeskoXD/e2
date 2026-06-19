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

        {/* Spodní sekce: Formulář a Mapa ČR */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Kontaktní formulář */}
          <div className="bg-white rounded-2xl p-8 md:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/50">
            <h2 className="text-2xl font-bold text-[#132333] mb-2">Napište nám</h2>
            <p className="text-gray-500 mb-8 text-sm">Potřebujete poradit se zaměřením? Nahrajte fotku okna a my se vám ozveme s řešením.</p>
            <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); alert('Děkujeme za zprávu. Brzy se Vám ozveme.'); }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Jméno</label>
                  <input type="text" required className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#CCAD8A] outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">E-mail</label>
                  <input type="email" required className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#CCAD8A] outline-none transition-all" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Zpráva</label>
                <textarea rows={4} required className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#CCAD8A] outline-none transition-all resize-none"></textarea>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Fotografie okna (volitelné)</label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl hover:border-[#CCAD8A] transition-colors cursor-pointer bg-gray-50 group">
                  <div className="space-y-1 text-center">
                    <svg className="mx-auto h-8 w-8 text-gray-400 group-hover:text-[#CCAD8A] transition-colors" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="flex text-sm text-gray-600 justify-center mt-2">
                      <label htmlFor="file-upload" className="relative cursor-pointer bg-transparent rounded-md font-medium text-[#CCAD8A] hover:text-[#b5997a] focus-within:outline-none">
                        <span>Vybrat soubor z počítače</span>
                        <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/*" />
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">PNG, JPG do 10MB</p>
                  </div>
                </div>
              </div>
              <button type="submit" className="w-full bg-[#132333] text-white font-bold py-4 rounded-xl hover:bg-[#1a3145] transition-all flex items-center justify-center gap-2 mt-2">
                Odeslat zprávu
              </button>
            </form>
          </div>

          {/* Mapa ČR - Info */}
          <div className="bg-[#CCAD8A]/5 rounded-2xl p-8 md:p-10 border border-[#CCAD8A]/20 flex flex-col justify-center items-center text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-center">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="w-96 h-96 text-[#132333] -rotate-12 transform translate-x-12"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg>
            </div>
            <div className="relative z-10">
              <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg mx-auto mb-6">
                <MapPin className="text-[#CCAD8A] w-10 h-10" />
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-[#132333] mb-4">Doručíme po celé ČR</h2>
              <p className="text-base text-gray-600 mb-8 max-w-sm mx-auto leading-relaxed">
                Nemáme kamennou pobočku, ale naše stínicí technika míří ke spokojeným zákazníkům do všech koutů České republiky.
              </p>
              <div className="flex flex-col gap-4 max-w-xs mx-auto text-left bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="text-green-500 shrink-0" size={20} />
                  <span className="font-semibold text-sm text-[#132333]">Rychlé doručení kurýrem</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="text-green-500 shrink-0" size={20} />
                  <span className="font-semibold text-sm text-[#132333]">Pečlivé zabalení produktů</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="text-green-500 shrink-0" size={20} />
                  <span className="font-semibold text-sm text-[#132333]">Doprava zdarma nad 5 000 Kč</span>
                </div>
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
