import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Phone, Search, ShoppingBag } from 'lucide-react';

export default function Header({
  cartCount,
  currentPath = typeof window !== 'undefined' ? window.location.hash || '#/' : '#/',
}: {
  cartCount: number;
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
    <header className="bg-[#FDFBF7] text-[#132333] sticky top-0 w-full z-50 shadow-sm">
      <div className="container mx-auto px-6 py-5 flex items-center justify-between gap-6">
        
        {/* Logo */}
        <a href="#/" className="shrink-0 flex items-center">
          <img 
            src="https://web2.itnahodinu.cz/QAPI/Logo.webp" 
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
            }}
            alt="Qapi" 
            className="h-12 md:h-14 w-auto object-contain" 
          />
          <span className="hidden font-black text-4xl tracking-tight text-[#132333]">Qapi</span>
        </a>

        {/* Search Bar */}
        <div className="flex-1 w-full hidden md:flex mx-4 max-w-3xl" ref={searchRef}>
          <div className="relative w-full flex items-center bg-white border border-gray-200 rounded-md shadow-sm">
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Hledat produkt (např. rolety den a noc, žaluzie...)" 
              className="w-full bg-transparent text-gray-800 placeholder-gray-400 border-none rounded-l-md py-3 px-5 outline-none transition-colors"
            />
            <button className="bg-[#CCAD8A] hover:bg-[#b5997a] text-[#132333] px-6 py-3 rounded-r-md transition-colors flex items-center justify-center border-l border-[#CCAD8A]">
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
                          {p.cover_image ? (
                            <img src={p.cover_image} alt={p.title} className="w-12 h-12 object-cover rounded bg-gray-100" />
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
        <div className="flex items-center space-x-3 shrink-0">
          <button className="hidden xl:flex text-[#132333] hover:text-[#CCAD8A] px-4 py-2.5 font-semibold items-center space-x-2 transition-colors">
            <Phone size={18} />
            <span>{phone}</span>
          </button>
          <a
            href="#/kosik"
            className="relative bg-green-500 hover:bg-green-600 active:bg-green-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center space-x-2 transition-colors shadow-sm"
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
      <div className="bg-[#EAE0D3] border-b-[3px] border-[#13233330]">
        <div className="container mx-auto px-6 overflow-x-auto hide-scroll-bar">
          <nav className="flex items-center space-x-8 py-3 text-[14px] font-bold whitespace-nowrap text-[#5a4835]">
            <a
              href="#/"
              className={`transition-colors hover:text-[#132333] ${isHome ? 'text-[#132333]' : ''}`}
            >
              Domů
            </a>
            <a
              href="#/kategorie"
              className={`flex items-center space-x-1 transition-colors group hover:text-[#132333] ${
                isKategorie ? 'text-[#132333]' : ''
              }`}
            >
              <span>Všechny kategorie</span>
              <ChevronDown size={14} className="group-hover:rotate-180 transition-transform" />
            </a>
            <a
              href="#/jak-zamerit"
              className={`transition-colors hover:text-[#132333] ${isJakZamerit ? 'text-[#132333]' : ''}`}
            >
              Jak zaměřit
            </a>
            <a
              href="#/reference"
              className={`transition-colors hover:text-[#132333] ${isReference ? 'text-[#132333]' : ''}`}
            >
              Reference
            </a>
            <a
              href="#/o-nas"
              className={`transition-colors hover:text-[#132333] ${isONas ? 'text-[#132333]' : ''}`}
            >
              O nás
            </a>
            <a
              href="#/kontakt"
              className={`transition-colors hover:text-[#132333] ${isKontakt ? 'text-[#132333]' : ''}`}
            >
              Kontakt
            </a>
            <div className="flex-1"></div>
            <a
              href="https://qapi.cz/"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-green-500 hover:bg-green-600 active:bg-green-700 text-white px-5 py-2 rounded-xl transition-colors shadow-sm flex items-center ml-auto"
            >
              CHCI SERVIS
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}
