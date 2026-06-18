import React, { useState } from 'react';
import Hero from '../components/Hero';
import Benefits from '../components/Benefits';
import Categories from '../components/Categories';
import FeaturedProducts from '../components/FeaturedProducts';
import HowItWorks from '../components/HowItWorks';
import { Helmet } from 'react-helmet-async';
import { ShieldCheck, CheckCircle2, Calculator } from 'lucide-react';

function QuickCalculator() {
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  
  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    window.location.hash = '#/kategorie';
  };

  return (
    <div className="bg-[#132333] border-b border-[#1a3145] text-white py-4 relative z-20 shadow-lg">
      <div className="container mx-auto px-6">
        <form onSubmit={handleCalculate} className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#CCAD8A]/20 rounded-lg text-[#CCAD8A]">
              <Calculator size={20} />
            </div>
            <span className="font-bold">Znáte své rozměry?</span>
            <span className="text-gray-400 text-sm hidden md:inline">Zadejte je a vyberte si produkt.</span>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input 
                type="number" 
                placeholder="Šířka (mm)" 
                value={width}
                onChange={e => setWidth(e.target.value)}
                className="bg-[#1a3145] border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#CCAD8A] w-full sm:w-32"
              />
              <span className="text-gray-500">×</span>
              <input 
                type="number" 
                placeholder="Výška (mm)" 
                value={height}
                onChange={e => setHeight(e.target.value)}
                className="bg-[#1a3145] border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#CCAD8A] w-full sm:w-32"
              />
            </div>
            <button type="submit" className="w-full sm:w-auto bg-[#CCAD8A] text-[#132333] px-6 py-2 rounded-lg font-bold text-sm hover:bg-[#b5997a] transition-colors whitespace-nowrap mt-2 sm:mt-0">
              Spočítat cenu
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TrustBanner() {
  return (
    <div className="bg-[#132333] py-12 border-t border-[#1a3145]">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-4">
            <ShieldCheck className="w-12 h-12 text-[#CCAD8A]" />
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Spolehlivý nákup</h3>
              <p className="text-gray-400 text-sm">Garantujeme kvalitu všech našich produktů a spokojenost.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-8 text-white text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="text-[#CCAD8A] w-5 h-5 flex-shrink-0" />
              <span>Přesná výroba na míru v ČR</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="text-[#CCAD8A] w-5 h-5 flex-shrink-0" />
              <span>Ověřené prémiové komponenty</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="text-[#CCAD8A] w-5 h-5 flex-shrink-0" />
              <span>Podpora s výběrem i samotnou odbornou montáží</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="text-[#CCAD8A] w-5 h-5 flex-shrink-0" />
              <span>Doprava zdarma u objednávek nad 5 000 Kč</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex-grow bg-gray-50">
      <Helmet>
        <title>Qapi.cz - Spolehlivý obchod se stínící technikou na míru</title>
        <meta name="description" content="Na Qapi.cz najdete kvalitní sítě proti hmyzu a rolety s možností konfigurace na míru." />
      </Helmet>
      <Hero />
      <QuickCalculator />
      <Benefits />
      
      {/* Featured Products brought up higher for immediate shopping */}
      <div className="mt-8">
        <FeaturedProducts />
      </div>

      <div className="bg-white">
        <Categories />
      </div>

      <div className="bg-gray-50 border-y border-gray-200">
        <HowItWorks />
      </div>

      <TrustBanner />
    </div>
  );
}
