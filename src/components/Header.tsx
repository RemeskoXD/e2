import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Phone, Search, ShoppingBag } from 'lucide-react';

export default function Header({
  cartCount,
  currentPath = typeof window !== 'undefined' ? window.location.hash || '#/' : '#/',
}: {
  cartCount: number;
  /** Hash route z App (aby se zvýraznění menu aktualizovalo při navigaci). */
  currentPath?: string;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [phone, setPhone] = useState('+420 774 060 193');
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/store-settings')
      .then(res => res.json())
      .then(data => {
        if (data.phone) setPhone(data.phone);
      })
      .catch(() => {});
      
    fetch('/api/products')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setProducts(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchResults = products.filter(p => 
    (p.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (p.desc || '').toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 5);

  const hash = currentPath || '#/';
  const pathBase = hash.split('?')[0];
  const isHome = pathBase === '#/' || pathBase === '';
  const isKategorie = pathBase === '#/kategorie';
  const isReference = pathBase === '#/reference';
  const isKontakt = pathBase === '#/kontakt';
  const isJakZamerit = pathBase === '#/jak-zamerit';
  const isONas = pathBase === '#/o-nas';

  return (
    <header className="bg-[#132333] text-white sticky top-0 w-full z-50">
      <div className="container mx-auto px-6 pt-4 pb-[2px] flex items-center justify-between gap-6">
        
        {/* Logo */}
        <a href="#/" className="shrink-0 flex items-center">
          <img 
            src="https://web2.itnahodinu.cz/QAPI/Logo-Bile.webp" 
            alt="Qapi" 
            className="h-20 md:h-24 w-auto object-contain" 
          />
        </a>

        {/* Search Bar */}
        <div className="flex-1 w-full hidden md:flex mx-4" ref={searchRef}>
          <div className="relative w-full flex items-center shadow-sm">
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Hledat produkt (např. rolety den a noc, žaluzie...)" 
              className="w-full bg-white text-gray-800 placeholder-gray-400 border-none rounded-l-md py-3 px-5 outline-none transition-colors"
            />
            <button className="bg-[#CCAD8A] hover:bg-[#b5997a] text-[#132333] px-6 py-3 rounded-r-md transition-colors flex items-center justify-center">
              <Search size={20} />
            </button>
            
            {/* Autocomplete Dropdown */}
            {showDropdown && searchQuery.length > 1 && (
              <div className="absolute top-full mt-2 left-0 w-full bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden z-[100]">
                {searchResults.length > 0 ? (
                  <ul className="max-h-[400px] overflow-y-auto">
                    {searchResults.map(p => (
                      <li key={p.id}>
                        <a 
                          href={`#/produkt/${p.slug || p.id}`}
                          onClick={() => {
                            setShowDropdown(false);
                            setSearchQuery('');
                          }}
                          className="flex items-center gap-4 p-3 hover:bg-gray-50 border-b border-gray-50 transition-colors"
                        >
                          {p.images && p.images.length > 0 ? (
                            <img src={p.images[0].url} alt={p.title} className="w-12 h-12 object-cover rounded bg-gray-100" />
                          ) : (
                            <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center text-gray-400 text-xs">Bez foto</div>
                          )}
                          <div>
                            <div className="font-bold text-[#132333] text-sm">{p.title}</div>
                            <div className="text-xs text-gray-500">{p.category}</div>
                          </div>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-4 text-center text-gray-500 text-sm">Nic jsme nenašli.</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 sm:space-x-4 text-sm shrink-0">
          <button className="hidden xl:flex border border-white/20 hover:border-white/50 bg-white/5 px-4 py-2.5 rounded-md font-semibold items-center space-x-2 transition-colors">
            <Phone size={18} />
            <span>{phone}</span>
          </button>
          <a
            href="#/kosik"
            className="relative bg-[#CCAD8A] hover:bg-[#b5997a] text-[#132333] px-5 py-2.5 rounded-md font-bold flex items-center space-x-2 transition-colors"
          >
            <ShoppingBag size={18} />
            <span className="hidden sm:inline">Košík</span>
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full animate-in zoom-in">
                {cartCount}
              </span>
            )}
          </a>
        </div>
      </div>

      {/* Navigation Bar */}
      <div className="bg-[#0F1D2B] relative -mb-[1px]">
        <div className="container mx-auto px-6 overflow-x-auto hide-scroll-bar">
          <nav className="flex items-center space-x-8 py-3 text-sm font-medium whitespace-nowrap">
            <a
              href="#/"
              className={`transition-colors ${isHome ? 'text-white font-bold' : 'text-[#CCAD8A] hover:text-white'}`}
            >
              Domů
            </a>
            <a
              href="#/kategorie"
              className={`flex items-center space-x-1 transition-colors group ${
                isKategorie ? 'text-white font-bold' : 'text-[#CCAD8A] hover:text-white'
              }`}
            >
              <span>Všechny kategorie</span>
              <ChevronDown size={14} className="group-hover:rotate-180 transition-transform" />
            </a>
            <a
              href="#/jak-zamerit"
              className={`transition-colors ${
                isJakZamerit ? 'text-white font-bold' : 'text-[#CCAD8A] hover:text-white'
              }`}
            >
              Jak zaměřit
            </a>
            <a
              href="#/reference"
              className={`transition-colors ${isReference ? 'text-white font-bold' : 'text-[#CCAD8A] hover:text-white'}`}
            >
              Reference
            </a>
            <a
              href="#/o-nas"
              className={`transition-colors ${isONas ? 'text-white font-bold' : 'text-[#CCAD8A] hover:text-white'}`}
            >
              O nás
            </a>
            <a
              href="#/kontakt"
              className={`transition-colors ${isKontakt ? 'text-white font-bold' : 'text-[#CCAD8A] hover:text-white'}`}
            >
              Kontakt
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}
