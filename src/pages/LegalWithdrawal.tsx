import { useState } from 'react';
import LegalNav from '../components/LegalNav';

const SHOP_EMAIL = 'info@qapi.cz';

/** Vzorový formulář odstoupení — otevře e-mail klientovi s předvyplněným textem (bez ukládání na server). */
export default function LegalWithdrawal() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [orderNo, setOrderNo] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');

  const buildBody = () => {
    const lines = [
      'Dobrý den,',
      '',
      'tímto využívám svého práva odstoupit od kupní smlouvy uzavřené prostřednictvím internetového obchodu Qapi.',
      '',
      `Jméno a příjmení: ${name || '…'}`,
      `E-mail: ${email || '…'}`,
      `Číslo objednávky: ${orderNo || '…'}`,
      `Datum objednávky / uzavření smlouvy: ${orderDate || '…'}`,
      `Adresa (pro vrácení zboží / korespondenci): ${address || '…'}`,
    ];
    if (note.trim()) {
      lines.push('', 'Doplňující informace:', note.trim());
    }
    lines.push(
      '',
      'Datum: ' + new Date().toLocaleDateString('cs-CZ'),
      '',
      'S pozdravem'
    );
    return lines.join('\n');
  };

  const openMail = () => {
    const subject = encodeURIComponent('Odstoupení od smlouvy — internetový obchod Qapi');
    const body = encodeURIComponent(buildBody());
    window.location.href = `mailto:${SHOP_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="flex-grow container mx-auto px-6 py-12 max-w-3xl">
      <h1 className="text-3xl font-extrabold text-[#132333] mb-2">Odstoupení od smlouvy</h1>
      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6">
        Vyplňte údaje a použijte tlačítko níže — otevře se váš e-mailový program se <strong>šablonou</strong>.
        Odstoupení musí být v souladu s{' '}
        <a href="#/obchodni-podminky" className="text-[#132333] font-semibold underline">
          obchodními podmínkami
        </a>{' '}
        a platnou legislativou (u zboží na míru mohou platit výjimky).
      </p>

      <LegalNav />

      <div className="space-y-4 text-sm">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Jméno a příjmení *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#CCAD8A] outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">E-mail *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#CCAD8A] outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Číslo objednávky</label>
          <input
            value={orderNo}
            onChange={(e) => setOrderNo(e.target.value)}
            placeholder="např. Q-1735…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#CCAD8A] outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Datum objednávky</label>
          <input
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            placeholder="např. 1. 5. 2026"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#CCAD8A] outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Kontaktní adresa</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#CCAD8A] outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Poznámka (volitelné)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#CCAD8A] outline-none"
          />
        </div>

        <button
          type="button"
          onClick={openMail}
          className="w-full bg-[#132333] text-white font-bold py-3 rounded-xl hover:bg-[#1a3145]"
        >
          Odeslat přes e-mail ({SHOP_EMAIL})
        </button>
        <p className="text-xs text-gray-500">
          Pokud se e-mail neotevře, zkopírujte text ručně a pošlete na{' '}
          <a href={`mailto:${SHOP_EMAIL}`} className="text-[#CCAD8A] font-semibold">
            {SHOP_EMAIL}
          </a>
          .
        </p>
      </div>

      <p className="mt-10 text-sm">
        <a href="#/" className="text-[#CCAD8A] font-bold">
          Zpět na úvod
        </a>
      </p>
    </div>
  );
}
