import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save } from 'lucide-react';
import { formatCzk } from '../../lib/money';

interface Props {
  productId: string | number;
  productTitle: string;
  priceMode: string | null;
  onClose: () => void;
}

type Bracket = {
  id?: number;
  width_mm_max: number | '';
  height_mm_max: number | '';
  base_price_czk: number | '';
  sort_order?: number;
};

type Tier = {
  id?: number;
  height_mm_min: number | '';
  height_mm_max: number | '';
  price_per_m2_czk: number | '';
  sort_order?: number;
};

type Col = { id: string; val: number | '' };
type Row = { id: string; val: number | '' };

const randId = () => Date.now().toString(36) + Math.random().toString(36);

export default function AdminPriceMatrixModal({ productId, productTitle, priceMode, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cols, setCols] = useState<Col[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [prices, setPrices] = useState<Record<string, number | ''>>({});

  const [tiers, setTiers] = useState<Tier[]>([]);

  const isMatrix = priceMode === 'matrix_cell';
  const isAreaTiers = priceMode === 'm2_height_tiers';

  const [basePriceFixed, setBasePriceFixed] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        if (isMatrix) {
          const res = await fetch(`/api/admin/products/${productId}/brackets`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
          });
          const data: Bracket[] = await res.json();
          if (res.ok) {
            if (data.length > 0) {
              setBasePriceFixed(Number(data[0].base_price_czk) || 0);
            }
            const ws = Array.from(new Set(data.map((b) => Number(b.width_mm_max)))).sort((a,b)=>a-b);
            const hs = Array.from(new Set(data.map((b) => Number(b.height_mm_max)))).sort((a,b)=>a-b);
            
            const cs = ws.map(w => ({ id: randId(), val: w }));
            const rs = hs.map(h => ({ id: randId(), val: h }));

            const pr: Record<string, number | ''> = {};
            data.forEach(b => {
              const cid = cs.find(c => c.val === b.width_mm_max)?.id;
              const rid = rs.find(r => r.val === b.height_mm_max)?.id;
              if (cid && rid) {
                pr[`${cid}_${rid}`] = b.base_price_czk;
              }
            });
            setCols(cs);
            setRows(rs);
            setPrices(pr);
          }
        } else if (isAreaTiers || priceMode === 'm2_area') {
           // Fallback to tiers if they exist, or maybe m2_area doesn't have tiers?
          const res = await fetch(`/api/admin/products/${productId}/tiers`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
          });
          const data = await res.json();
          if (res.ok) setTiers(data);
          
          if (priceMode === 'm2_area') {
             // For purely informational fixed base price 
             const bracketsRes = await fetch(`/api/admin/products/${productId}/brackets`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
             });
             const bData = await bracketsRes.json();
             if (bracketsRes.ok && bData.length > 0) {
               setBasePriceFixed(Number(bData[0].base_price_czk) || 0);
             }
          }
        }
      } catch (err) {
        setError('Nepodařilo se načíst ceník.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [productId, isMatrix, isAreaTiers, priceMode]);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      if (isMatrix) {
        const payload: Bracket[] = [];
        let s = 0;
        
        // Sorting exactly by limits to make order logical
        const sortedCols = [...cols].sort((a, b) => Number(a.val) - Number(b.val));
        const sortedRows = [...rows].sort((a, b) => Number(a.val) - Number(b.val));

        sortedCols.forEach(c => {
          sortedRows.forEach(r => {
            const p = prices[`${c.id}_${r.id}`];
            if (p !== undefined && p !== '' && c.val !== '' && r.val !== '') {
              payload.push({
                width_mm_max: c.val,
                height_mm_max: r.val,
                base_price_czk: p,
                sort_order: s++
              });
            }
          });
        });

        const res = await fetch(`/api/admin/products/${productId}/brackets`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('adminToken')}`,
          },
          body: JSON.stringify({ rows: payload }),
        });
        if (!res.ok) throw new Error('Nepodařilo se uložit ceník.');
      } else {
         const payload = tiers.map((t, i) => ({
          ...t,
          sort_order: i,
        }));
        const res = await fetch(`/api/admin/products/${productId}/tiers`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('adminToken')}`,
          },
          body: JSON.stringify({ rows: payload }),
        });
        if (!res.ok) throw new Error('Nepodařilo se uložit ceník.');
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Nepodařilo se uložit ceník.');
    } finally {
      setSaving(false);
    }
  };

  const addTier = () => setTiers([...tiers, { height_mm_min: '', height_mm_max: '', price_per_m2_czk: '' }]);

  return (
    <div className="fixed inset-0 bg-[#132333]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="sticky top-0 bg-white border-b border-gray-100 p-6 flex justify-between items-center z-10 shrink-0 rounded-t-2xl">
          <div>
            <h2 className="text-xl font-bold text-[#132333]">Úprava ceníku</h2>
            <p className="text-sm text-gray-500">{productTitle} — {priceMode || 'Standardní'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-[#132333] transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto grow">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          {loading ? (
            <div className="text-center py-10 text-gray-400">Načítám...</div>
          ) : (
            <div>
              {isMatrix ? (
                <>
                  <p className="text-sm text-gray-600 mb-4">
                    Tabulka limitů (matrix) - cena se určí podle první buňky, kam se šířka i výška vejdou.
                  </p>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden pb-1">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse min-w-max">
                        <thead>
                          <tr className="bg-gray-100/80">
                            <th className="sticky left-0 bg-gray-100 p-2 font-bold z-20 shadow-[1px_0_0_0_rgb(229,231,235)] border-b border-gray-200">
                              <div className="flex flex-col text-xs text-gray-500">
                                <span className="font-semibold text-gray-700">Šířka →</span>
                                <span className="font-semibold text-gray-700">Výška ↓</span>
                              </div>
                            </th>
                            {cols.map((c, cIdx) => (
                              <th key={c.id} className="p-2 font-semibold text-center border-l border-b border-gray-200 bg-gray-100 min-w-[80px]">
                                <div className="flex flex-col items-center justify-between gap-1">
                                  <input 
                                    type="number"
                                    value={c.val}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? '' : Number(e.target.value);
                                      setCols(cols.map(col => col.id === c.id ? { ...col, val } : col));
                                    }}
                                    className="w-16 px-1 py-0.5 border border-gray-300 rounded focus:ring-2 focus:ring-[#CCAD8A] bg-white text-center shadow-sm"
                                    placeholder="Šířka"
                                  />
                                  <button aria-label="Smazat šířku" onClick={() => {
                                    setCols(cols.filter(x => x.id !== c.id));
                                    const newPrices = {...prices};
                                    rows.forEach(r => delete newPrices[`${c.id}_${r.id}`]);
                                    setPrices(newPrices);
                                  }} className="text-gray-400 hover:text-red-500 p-1 transition-colors">
                                    <Trash2 size={14}/>
                                  </button>
                                </div>
                              </th>
                            ))}
                            <th className="p-2 border-l border-b border-gray-200 bg-gray-50 text-center w-12">
                              <button 
                                onClick={() => setCols([...cols, { id: randId(), val: (cols[cols.length-1]?.val || 0) + 100 }])} 
                                className="text-gray-400 hover:text-[#CCAD8A] p-2 bg-white border border-gray-200 shadow-sm rounded flex items-center justify-center m-auto transition-colors"
                                title="Přidat sloupec (šířku)"
                              >
                                <Plus size={16}/>
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {rows.map((r, rIdx) => (
                            <tr key={r.id} className="hover:bg-gray-50 group">
                              <th className="sticky left-0 bg-white group-hover:bg-gray-50 transition-colors shadow-[1px_0_0_0_rgb(229,231,235)] p-2 font-semibold z-10 border-b border-gray-100">
                                <div className="flex items-center justify-between gap-2">
                                  <input
                                    type="number"
                                    value={r.val}
                                    onChange={(e) => {
                                        const val = e.target.value === '' ? '' : Number(e.target.value);
                                        setRows(rows.map(row => row.id === r.id ? { ...row, val } : row));
                                    }}
                                    className="w-16 px-1 py-0.5 border border-gray-300 shadow-sm rounded focus:ring-2 focus:ring-[#CCAD8A] bg-white text-center"
                                    placeholder="Výška"
                                  />
                                  <button aria-label="Smazat výšku" onClick={() => {
                                     setRows(rows.filter(x => x.id !== r.id));
                                     const newPrices = {...prices};
                                     cols.forEach(c => delete newPrices[`${c.id}_${r.id}`]);
                                     setPrices(newPrices);
                                  }} className="text-gray-400 hover:text-red-500 p-1 transition-colors">
                                    <Trash2 size={14}/>
                                  </button>
                                </div>
                              </th>
                              {cols.map((c, cIdx) => (
                                <td key={c.id} className="p-1 border-l border-b border-gray-100 text-center relative pointer-events-auto">
                                  <input
                                    type="number"
                                    value={prices[`${c.id}_${r.id}`] ?? ''}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? '' : Number(e.target.value);
                                      setPrices({...prices, [`${c.id}_${r.id}`]: val});
                                    }}
                                    onKeyDown={(e) => {
                                      const tr = e.currentTarget.closest('tr');
                                      const td = e.currentTarget.closest('td');
                                      if (e.key === 'ArrowRight') {
                                        e.preventDefault();
                                        const next = td?.nextElementSibling?.querySelector('input');
                                        next?.focus();
                                      } else if (e.key === 'ArrowLeft') {
                                        e.preventDefault();
                                        const prev = td?.previousElementSibling?.querySelector('input');
                                        prev?.focus();
                                      } else if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        const cellIdx = Array.from(tr?.children || []).indexOf(td as any);
                                        const nextRow = tr?.nextElementSibling;
                                        const dCell = nextRow?.children[cellIdx]?.querySelector('input');
                                        dCell?.focus();
                                      } else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        const cellIdx = Array.from(tr?.children || []).indexOf(td as any);
                                        const prevRow = tr?.previousElementSibling;
                                        const uCell = prevRow?.children[cellIdx]?.querySelector('input');
                                        uCell?.focus();
                                      }
                                    }}
                                    className="w-full min-w-[70px] px-2 py-1.5 focus:bg-amber-50 rounded outline-none border border-transparent focus:border-amber-200 focus:ring-2 focus:ring-[#CCAD8A]/50 text-center transition-all hover:bg-gray-50/80"
                                    placeholder="-"
                                  />
                                </td>
                              ))}
                              <td className="p-2 border-l border-b border-gray-100"></td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50/50">
                            <th className="sticky left-0 bg-gray-50/50 shadow-[1px_0_0_0_rgb(229,231,235)] p-2 font-semibold z-10 rounded-bl-xl border-t border-gray-200">
                              <button onClick={() => setRows([...rows, { id: randId(), val: (rows[rows.length-1]?.val || 0) + 100 }])} className="text-gray-500 hover:text-[#CCAD8A] flex items-center justify-center gap-1 w-full bg-white border border-gray-200 shadow-sm py-1.5 rounded transition">
                                <Plus size={16}/> Nová výška
                              </button>
                            </th>
                            <td colSpan={cols.length + 1} className="border-t border-gray-200"></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : isAreaTiers || priceMode === 'm2_area' ? (
                <>
                  <p className="text-sm text-gray-600 mb-4">
                    Cenové pásma - cena za m² podle výšky produktu. (Běžně pro vertikální žaluzie atd.)
                  </p>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-100 border-b border-gray-200 text-sm text-gray-600 uppercase">
                          <th className="p-3 font-semibold">Min Výška (mm)</th>
                          <th className="p-3 font-semibold">Max Výška (mm)</th>
                          <th className="p-3 font-semibold">Cena za m² (Kč)</th>
                          <th className="p-3 font-semibold w-12"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {tiers.map((t, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="p-2">
                              <input
                                type="number"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CCAD8A] outline-none"
                                value={t.height_mm_min}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  const nt = [...tiers];
                                  nt[i].height_mm_min = v === '' ? '' : Number(v);
                                  setTiers(nt);
                                }}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CCAD8A] outline-none"
                                value={t.height_mm_max}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  const nt = [...tiers];
                                  nt[i].height_mm_max = v === '' ? '' : Number(v);
                                  setTiers(nt);
                                }}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CCAD8A] outline-none"
                                value={t.price_per_m2_czk}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  const nt = [...tiers];
                                  nt[i].price_per_m2_czk = v === '' ? '' : Number(v);
                                  setTiers(nt);
                                }}
                              />
                            </td>
                            <td className="p-2 text-right">
                              <button
                                onClick={() => setTiers(tiers.filter((_, idx) => idx !== i))}
                                className="text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition"
                              >
                                <Trash2 size={18} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    onClick={addTier}
                    className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#CCAD8A] hover:text-[#b5997a]"
                  >
                    <Plus size={16} /> Přidat řádek
                  </button>
                </>
              ) : (
                <div className="flex bg-amber-50 text-amber-800 p-4 rounded-xl border border-amber-200 items-center justify-center text-center">
                  Tento produkt používá pevnou cenu ({formatCzk(basePriceFixed)} Kč základ). Nemá plošný nebo rozměrový ceník.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 p-6 flex justify-end gap-3 shrink-0 rounded-b-2xl bg-gray-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
          >
            Zrušit
          </button>
          {!(!isMatrix && !isAreaTiers && priceMode !== 'm2_area') && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 rounded-lg bg-[#132333] text-white font-semibold hover:bg-[#1a3145] transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? 'Ukládám...' : 'Uložit ceník'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
