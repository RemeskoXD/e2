import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'qapi_cart_v1';

export type CartLine = {
  key: string;
  productId: number | string;
  title: string;
  img: string;
  category: string;
  widthMm: number;
  heightMm: number;
  quantity: number;
  unitPriceCzk: number;
  /** Volby předané do quote (látka, lamela, …) */
  options: Record<string, unknown>;
};

type CartContextValue = {
  lines: CartLine[];
  itemCount: number;
  subtotalCzk: number;
  addLine: (line: Omit<CartLine, 'key'> & { key?: string }) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function loadStored(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is CartLine =>
        x &&
        typeof x === 'object' &&
        typeof (x as CartLine).key === 'string' &&
        (typeof (x as CartLine).productId === 'number' || typeof (x as CartLine).productId === 'string')
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() =>
    typeof window !== 'undefined' ? loadStored() : []
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, [lines]);

  const itemCount = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);
  const subtotalCzk = useMemo(
    () => lines.reduce((s, l) => s + l.unitPriceCzk * l.quantity, 0),
    [lines]
  );

  const addLine = useCallback((line: Omit<CartLine, 'key'> & { key?: string }) => {
    const key =
      line.key ??
      `${line.productId}-${line.widthMm}-${line.heightMm}-${JSON.stringify(line.options)}-${Date.now()}`;
    setLines((prev) => [...prev, { ...line, key }]);
  }, []);

  const updateQuantity = useCallback((key: string, quantity: number) => {
    const q = Math.max(1, Math.floor(quantity) || 1);
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, quantity: q } : l)));
  }, []);

  const removeLine = useCallback((key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({ lines, itemCount, subtotalCzk, addLine, updateQuantity, removeLine, clear }),
    [lines, itemCount, subtotalCzk, addLine, updateQuantity, removeLine, clear]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
