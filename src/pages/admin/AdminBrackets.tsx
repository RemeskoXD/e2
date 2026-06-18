import { useEffect, useState } from 'react';
import { Save, Plus, Trash2 } from 'lucide-react';

type BracketRow = {
  id?: number;
  width_mm_max: number;
  height_mm_max: number;
  base_price_czk: number;
  sort_order?: number;
};

type ProductOpt = { id: number; title: string };

export default function AdminBrackets() {
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [productId, setProductId] = useState<number | ''>('');
  const [rows, setRows] = useState<BracketRow[]>([]);
  const [csvText, setCsvText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token = () => localStorage.getItem('adminToken');

  useEffect(() => {
    const load = async () => {
      try {
        const adminToken = localStorage.getItem('adminToken') || '';
        const res = await fetch('/api/admin/products', { headers: { Authorization: `Bearer ${adminToken}` } });
        const data = await res.json();
        if (Array.isArray(data)) {
          setProducts(
            data.map((p: { id: number; title: string }) => ({ id: p.id, title: p.title }))
          );
        }
      } catch {
        /* ignore */
      }
    };
    load();
  }, []);

  const fetchBrackets = async (pid: number) => {
    const t = token();
    if (!t) {
      setError('Přihlaste se do administrace.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/${pid}/brackets`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setRows([]);
        setError(typeof data?.error === 'string' ? data.error : 'Načtení selhalo.');
        return;
      }
      setRows(
        (Array.isArray(data) ? data : []).map((r: Record<string, unknown>) => ({
          id: r.id as number | undefined,
          width_mm_max: Number(r.width_mm_max ?? r.widthMmMax),
          height_mm_max: Number(r.height_mm_max ?? r.heightMmMax),
          base_price_czk: Number(r.base_price_czk ?? r.basePriceCzk),
          sort_order: Number(r.sort_order ?? r.sortOrder ?? 0),
        }))
      );
    } catch {
      setRows([]);
      setError('Spojení se serverem selhalo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof productId === 'number' && productId > 0) {
      fetchBrackets(productId);
    } else {
      setRows([]);
    }
  }, [productId]);

  const parseCsv = () => {
    setMessage(null);
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const parsed: BracketRow[] = [];
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(/[;,]/).map((p) => p.trim());
      if (parts.length < 3) continue;
      const w = Number(parts[0]);
      const h = Number(parts[1]);
      const price = Number(parts[2]);
      const sort = parts[3] != null ? Number(parts[3]) : i;
      if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(price)) continue;
      parsed.push({
        width_mm_max: Math.round(w),
        height_mm_max: Math.round(h),
        base_price_czk: Math.round(price),
        sort_order: Number.isFinite(sort) ? Math.round(sort) : i,
      });
    }
    if (parsed.length) {
      setRows(parsed);
      setMessage(`Naimportováno ${parsed.length} řádků z CSV (náhled v tabulce). Uložte tlačítkem.`);
    } else {
      setError('CSV neobsahuje platné řádky (formát: šířka_max;výška_max;cena_kč[;pořadí]).');
    }
  };

  const save = async () => {
    if (typeof productId !== 'number' || productId < 1) {
      setError('Vyberte produkt.');
      return;
    }
    const t = token();
    if (!t) {
      setError('Přihlaste se.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        rows: rows.map((r, i) => ({
          width_mm_max: r.width_mm_max,
          height_mm_max: r.height_mm_max,
          base_price_czk: r.base_price_czk,
          sort_order: r.sort_order ?? i,
        })),
      };
      const res = await fetch(`/api/admin/products/${productId}/brackets`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${t}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Uložení selhalo.');
        return;
      }
      setMessage('Mřížka uložena.');
      setRows(
        (Array.isArray(data) ? data : []).map((r: Record<string, unknown>) => ({
          id: r.id as number | undefined,
          width_mm_max: Number(r.width_mm_max ?? r.widthMmMax),
          height_mm_max: Number(r.height_mm_max ?? r.heightMmMax),
          base_price_czk: Number(r.base_price_czk ?? r.basePriceCzk),
          sort_order: Number(r.sort_order ?? r.sortOrder ?? 0),
        }))
      );
    } catch {
      setError('Spojení selhalo.');
    } finally {
      setSaving(false);
    }
  };

  const addEmptyRow = () => {
    setRows((prev) => [
      ...prev,
      { width_mm_max: 1000, height_mm_max: 1000, base_price_czk: 0, sort_order: prev.length },
    ]);
  };

  const updateRow = (index: number, field: keyof BracketRow, value: string) => {
    const n = Number(value);
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: Number.isFinite(n) ? n : r[field] } : r))
    );
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-[#132333] mb-2">Ceníkové buňky (mřížka)</h1>
      <p className="text-gray-500 mb-6">
        Úprava tabulky <code className="bg-gray-100 px-1 rounded">ProductPriceBracket</code> pro
        vybraný produkt. Každý řádek = maximální šířka a výška buňky a základní cena vč. DPH.
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {message}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <label className="block text-sm font-semibold text-[#132333] mb-2">Produkt</label>
        <select
          value={productId === '' ? '' : String(productId)}
          onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : '')}
          className="w-full max-w-xl border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#CCAD8A] outline-none"
        >
          <option value="">— vyberte —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} (id {p.id})
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 className="font-bold text-[#132333] mb-2">Import CSV</h2>
        <p className="text-sm text-gray-500 mb-2">
          Jedna buňka na řádek: <code className="bg-gray-100 px-1">width_mm_max;height_mm_max;base_price_czk;sort</code>{' '}
          (sort volitelné, oddělovač ; nebo ,).
        </p>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={5}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 font-mono text-sm mb-3"
          placeholder="1200;1500;4500&#10;1500;1500;5200"
        />
        <button
          type="button"
          onClick={parseCsv}
          className="bg-gray-100 text-[#132333] font-semibold px-4 py-2 rounded-lg hover:bg-gray-200"
        >
          Načíst do tabulky
        </button>
      </div>

      {loading && productId ? (
        <div className="text-center py-12 text-gray-500">Načítám mřížku…</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 mb-4">
            <button
              type="button"
              onClick={addEmptyRow}
              className="inline-flex items-center gap-2 bg-gray-100 text-[#132333] font-semibold px-4 py-2 rounded-lg hover:bg-gray-200"
            >
              <Plus size={18} /> Přidat řádek
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !productId}
              className="inline-flex items-center gap-2 bg-[#CCAD8A] text-[#132333] font-bold px-4 py-2 rounded-lg hover:bg-[#b5997a] disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? 'Ukládám…' : 'Uložit mřížku'}
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
                    <th className="py-3 px-4 font-semibold">max šířka mm</th>
                    <th className="py-3 px-4 font-semibold">max výška mm</th>
                    <th className="py-3 px-4 font-semibold">cena základ Kč</th>
                    <th className="py-3 px-4 font-semibold">pořadí</th>
                    <th className="py-3 px-4 w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="py-2 px-4">
                        <input
                          type="number"
                          value={r.width_mm_max}
                          onChange={(e) => updateRow(i, 'width_mm_max', e.target.value)}
                          className="w-28 border border-gray-200 rounded px-2 py-1"
                        />
                      </td>
                      <td className="py-2 px-4">
                        <input
                          type="number"
                          value={r.height_mm_max}
                          onChange={(e) => updateRow(i, 'height_mm_max', e.target.value)}
                          className="w-28 border border-gray-200 rounded px-2 py-1"
                        />
                      </td>
                      <td className="py-2 px-4">
                        <input
                          type="number"
                          value={r.base_price_czk}
                          onChange={(e) => updateRow(i, 'base_price_czk', e.target.value)}
                          className="w-32 border border-gray-200 rounded px-2 py-1"
                        />
                      </td>
                      <td className="py-2 px-4">
                        <input
                          type="number"
                          value={r.sort_order ?? i}
                          onChange={(e) => updateRow(i, 'sort_order', e.target.value)}
                          className="w-20 border border-gray-200 rounded px-2 py-1"
                        />
                      </td>
                      <td className="py-2 px-4">
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && productId && (
              <p className="text-center text-gray-500 py-8 text-sm">Žádné buňky — přidejte řádek nebo CSV.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
