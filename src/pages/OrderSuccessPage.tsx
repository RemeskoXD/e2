import { useEffect, useState } from 'react';
import { useCart } from '../context/CartContext';

export default function OrderSuccessPage() {
  const { clear } = useCart();
  const [orderNo, setOrderNo] = useState<string | null>(null);

  useEffect(() => {
    // Vždy po úspěšné objednávce vysypeme košík
    clear();

    // Extrakce čísla objednávky z URL (např. #/objednavka-uspesna?order_no=Q-202310150001)
    const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const no = hashParams.get('order_no');
    if (no) {
      setOrderNo(no);
    }
  }, [clear]);

  return (
    <div className="flex-grow container mx-auto px-6 py-24 max-w-lg text-center">
      <h1 className="text-3xl font-extrabold text-[#132333] mb-4">Děkujeme za objednávku!</h1>
      
      {orderNo && (
        <p className="text-gray-600 mb-6 text-lg">
          Číslo vaší objednávky: <strong className="text-[#CCAD8A]">{orderNo}</strong>
        </p>
      )}

      <p className="text-gray-500 mb-8 leading-relaxed">
        Objednávku jsme v pořádku přijali. Na váš e-mail jsme odeslali potvrzení s detaily. Brzy vás budeme kontaktovat.
      </p>

      <div className="bg-green-50 text-green-800 p-4 rounded-xl border border-green-100 mb-10 text-sm">
        Pokud jste platili kartou online, platba se právě zpracovává.
      </div>

      <a href="#/" className="inline-block px-8 py-3 bg-[#132333] text-white font-bold rounded-xl hover:bg-[#1a2f4c] transition-colors">
        Zpět na úvodní stránku
      </a>
    </div>
  );
}
