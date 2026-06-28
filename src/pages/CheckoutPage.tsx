import { useState, type FormEvent } from 'react';
import { useCart } from '../context/CartContext';
import { formatCzk } from '../lib/money';

export default function CheckoutPage() {
  const { lines, subtotalCzk, clear } = useCart();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'transfer'>('card');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneOrderNo, setDoneOrderNo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) return;
    if (!agreedTerms) {
      setError('Potvrďte souhlas s obchodními podmínkami a zpracováním údajů.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const items = lines.map((l) => ({
        productId: l.productId,
        widthMm: l.widthMm,
        heightMm: l.heightMm,
        quantity: l.quantity,
        options: l.options,
      }));
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: { name, email, phone, note },
          paymentMethod,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Odeslání selhalo.');
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      const no = data.order_no ?? data.order?.order_no;
      setDoneOrderNo(typeof no === 'string' ? no : String(data.order?.id ?? ''));
      clear();
    } catch {
      setError('Nelze se spojit se serverem.');
    } finally {
      setSubmitting(false);
    }
  };

  if (doneOrderNo) {
    return (
      <div className="flex-grow container mx-auto px-6 py-24 max-w-lg text-center">
        <h1 className="text-2xl font-bold text-[#132333] mb-4">Děkujeme za objednávku</h1>
        <p className="text-gray-600 mb-2">
          Číslo objednávky: <strong>{doneOrderNo}</strong>
        </p>
        <p className="text-sm text-gray-500 mb-4">Brzy vás budeme kontaktovat.</p>
        <p className="text-xs text-gray-500 mb-8 max-w-md mx-auto leading-relaxed">
          Právní dokumenty a odstoupení:{' '}
          <a href="#/obchodni-podminky" className="text-[#CCAD8A] font-semibold">
            obchodní podmínky
          </a>
          ,{' '}
          <a href="#/odstoupeni" className="text-[#CCAD8A] font-semibold">
            odstoupení od smlouvy
          </a>
          .
        </p>
        <a href="#/" className="text-[#CCAD8A] font-bold">
          Zpět na úvod
        </a>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="flex-grow container mx-auto px-6 py-24 text-center">
        <h1 className="text-2xl font-bold text-[#132333] mb-4">Košík je prázdný</h1>
        <a href="#/kategorie" className="text-[#CCAD8A] font-bold">
          Do katalogu
        </a>
      </div>
    );
  }

  return (
    <div className="flex-grow container mx-auto px-6 py-12 max-w-xl">
      <h1 className="text-3xl font-extrabold text-[#132333] mb-2">Dokončení objednávky</h1>
      <p className="text-gray-500 text-sm mb-8">
        Ceny jsou vč. DPH. Celkem: <strong>{formatCzk(subtotalCzk)} Kč</strong>
      </p>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Jméno *</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#CCAD8A] outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">E-mail *</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#CCAD8A] outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Telefon</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#CCAD8A] outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Poznámka</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#CCAD8A] outline-none"
          />
        </div>

        <div className="pt-2">
          <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Způsob platby *</label>
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-4 border-2 border-green-500 bg-green-50 rounded-xl">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-white"></div>
              </div>
              <div>
                <span className="block text-sm font-bold text-gray-900">Platba kartou online (Stripe)</span>
                <span className="block text-xs text-gray-600 mt-0.5">Bezpečná platba přes platební bránu</span>
              </div>
            </div>
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer text-sm text-gray-700">
          <input
            type="checkbox"
            checked={agreedTerms}
            onChange={(e) => setAgreedTerms(e.target.checked)}
            className="mt-1 rounded border-gray-300 text-[#132333] focus:ring-[#CCAD8A]"
          />
          <span>
            Souhlasím s{' '}
            <a href="#/obchodni-podminky" className="text-[#CCAD8A] font-semibold underline">
              obchodními podmínkami
            </a>{' '}
            a se zpracováním osobních údajů dle{' '}
            <a href="#/ochrana-udaju" className="text-[#CCAD8A] font-semibold underline">
              informací pro zákazníky
            </a>
            . *
          </span>
        </label>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-green-500 text-white font-bold py-3.5 rounded-xl hover:bg-green-600 active:bg-green-700 disabled:opacity-50 transition-all shadow-md"
        >
          {submitting ? 'Odesílám…' : 'Odeslat objednávku'}
        </button>
      </form>
    </div>
  );
}
