import { useState, useEffect } from 'react';
import { Wrench, Truck, Star, Phone, Mail, MapPin, CreditCard } from 'lucide-react';

export default function Footer() {
  const [phone, setPhone] = useState('+420 774 060 193');
  const [email, setEmail] = useState('info@qapi.cz');
  const [companyName, setCompanyName] = useState('Qapi.cz');

  useEffect(() => {
    fetch('/api/store-settings')
      .then(res => res.json())
      .then(data => {
        if (data.phone) setPhone(data.phone);
        if (data.email) setEmail(data.email);
        if (data.companyName) setCompanyName(data.companyName);
      })
      .catch(() => {});
  }, []);
  return (
    <footer className="bg-[#101924] text-white pt-16">
      <div className="container mx-auto px-6 mb-12">
        {/* Bordered Container */}
        <div className="border border-white/10 rounded-2xl p-10 lg:p-14 bg-[#142331]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10">
            
            {/* Column 1: Brand & Intro */}
            <div className="lg:col-span-3 space-y-6">
              <div className="text-3xl font-bold tracking-tight">
                Qapi
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-400 mb-2 uppercase tracking-wider">
                  Vrata a stínění na míru
                </h4>
                <p className="text-sm text-gray-300 leading-relaxed">
                  Prémiový e-shop pro stínící techniku a sítě proti hmyzu s doručením až k vám.
                </p>
              </div>
              <a
                href="#/kategorie"
                className="inline-block bg-[#CCAD8A] hover:bg-[#b5997a] text-[#132333] font-bold px-6 py-3 rounded-md transition-colors text-sm text-center"
              >
                Přejít do obchodu
              </a>
            </div>

            {/* Column 2: Sortiment */}
            <div className="lg:col-span-2 space-y-4">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                Sortiment
              </h4>
              <nav className="flex flex-col space-y-3 text-sm text-gray-300">
                <a href="#/kategorie" className="hover:text-[#CCAD8A] transition-colors">
                  Interiérové stínění
                </a>
                <a href="#/kategorie" className="hover:text-[#CCAD8A] transition-colors">
                  Venkovní stínění
                </a>
                <a href="#/kategorie" className="hover:text-[#CCAD8A] transition-colors">
                  Sítě proti hmyzu
                </a>
                <a href="#/kategorie" className="hover:text-[#CCAD8A] transition-colors">Markýzy</a>
              </nav>
            </div>

            {/* Column 3: Služby */}
            <div className="lg:col-span-2 space-y-4">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                Služby
              </h4>
              <nav className="flex flex-col space-y-3 text-sm text-gray-300">
                <a href="#/jak-zamerit" className="hover:text-[#CCAD8A] transition-colors">
                  Jak zaměřit montáž
                </a>
                <a href="#/reference" className="hover:text-[#CCAD8A] transition-colors">
                  Reference našich prací
                </a>
                <a href="#/kontakt" className="hover:text-[#CCAD8A] transition-colors">
                  Poptávka a dotazy
                </a>
                <a
                  href="#/kategorie"
                  className="hover:text-[#CCAD8A] transition-colors flex items-center gap-2 mt-2"
                >
                  <Wrench size={14} className="text-gray-500" />
                  <span>Konfigurátor online</span>
                </a>
                <a href="#/kontakt" className="hover:text-[#CCAD8A] transition-colors flex items-center gap-2">
                  <Truck size={14} className="text-gray-500" />
                  <span>Doprava po celé ČR</span>
                </a>
              </nav>
            </div>

            {/* Column 4: Rychlé Odkazy */}
            <div className="lg:col-span-2 space-y-4">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                Rychlé odkazy
              </h4>
              <nav className="flex flex-col space-y-3 text-sm text-gray-300">
                <a href="#/o-nas" className="hover:text-[#CCAD8A] transition-colors">O nás</a>
                <a href="#/admin" className="hover:text-[#CCAD8A] transition-colors">Administrace e-shopu</a>
                <a href="#/obchodni-podminky" className="hover:text-[#CCAD8A] transition-colors">
                  Obchodní podmínky
                </a>
                <a href="#/ochrana-udaju" className="hover:text-[#CCAD8A] transition-colors">
                  Ochrana osobních údajů
                </a>
                <a href="#/cookies" className="hover:text-[#CCAD8A] transition-colors">Nastavení cookies</a>
                <a href="#/odstoupeni" className="hover:text-[#CCAD8A] transition-colors">
                  Odstoupení od smlouvy
                </a>
              </nav>
            </div>

            {/* Column 5: Right Info & Contact */}
            <div className="lg:col-span-3 space-y-8">
              
              {/* Partner Box */}
              <div className="border border-[#CCAD8A]/30 rounded-lg p-6 bg-[#132333]/50">
                <div className="flex items-center gap-2 text-[#CCAD8A] font-bold text-xs uppercase tracking-widest mb-3">
                  <Star size={14} fill="currentColor" />
                  <span>Oficiální partner Shadeon</span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed mb-4">
                  Inspirujeme se prémiovým standardem Shadeon a přenášíme jej do návrhu i realizace.
                </p>
                <a href="#" className="text-[#CCAD8A] text-sm font-semibold hover:underline">
                  Zobrazit partnerství
                </a>
              </div>

              {/* Contact Links */}
              <div className="space-y-4 text-sm text-gray-300">
                <div className="flex items-center gap-3">
                  <Phone size={16} className="text-[#CCAD8A]" />
                  <span className="font-semibold">{phone}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Mail size={16} className="text-[#CCAD8A]" />
                  <span className="font-semibold">{email}</span>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin size={16} className="text-[#CCAD8A]" />
                  <span>Doručení po celé ČR</span>
                </div>
                <div className="flex items-center gap-3">
                  <CreditCard size={16} className="text-[#CCAD8A]" />
                  <span className="leading-snug">Bezpečné online platby kartou</span>
                </div>
              </div>

            </div>

          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/5 py-8 text-center text-xs text-gray-500 bg-[#0A121A] space-y-3">
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <a href="#/obchodni-podminky" className="hover:text-[#CCAD8A]">
            Obchodní podmínky
          </a>
          <span className="text-white/20" aria-hidden>
            |
          </span>
          <a href="#/ochrana-udaju" className="hover:text-[#CCAD8A]">
            Ochrana údajů
          </a>
          <span className="text-white/20" aria-hidden>
            |
          </span>
          <a href="#/cookies" className="hover:text-[#CCAD8A]">
            Cookies
          </a>
          <span className="text-white/20" aria-hidden>
            |
          </span>
          <a href="#/odstoupeni" className="hover:text-[#CCAD8A]">
            Odstoupení
          </a>
        </div>
        <p>
          © {new Date().getFullYear()} {companyName} — Všechna práva vyhrazena. Prémiová stínící technika na míru.
        </p>
      </div>
    </footer>
  );
}
