import React, { useState } from 'react';
import Hero from '../components/Hero';
import Benefits from '../components/Benefits';
import Categories from '../components/Categories';
import FeaturedProducts from '../components/FeaturedProducts';
import HowItWorks from '../components/HowItWorks';
import Reviews from '../components/Reviews';
import { Helmet } from 'react-helmet-async';
import { ShieldCheck, CheckCircle2, Calculator } from 'lucide-react';



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

      <Reviews />

      <TrustBanner />
    </div>
  );
}
