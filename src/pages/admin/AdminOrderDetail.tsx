import { useEffect, useState } from 'react';
import { ArrowLeft, FileSpreadsheet, History } from 'lucide-react';
import { formatCzk } from '../../lib/money';
import toast from 'react-hot-toast';

type AuditLogRow = {
  id: number;
  action: string;
  old_value: string;
  new_value: string;
  timestamp: string;
};

type OrderItemRow = {
  id: number;
  product_id: number;
  product_title?: string;
  width_mm: number;
  height_mm: number;
  quantity: number;
  unit_price_czk: number;
  line_total_czk: number;
  options?: Record<string, unknown>;
};

type OrderDetail = {
  id: number;
  order_no?: string;
  date?: string;
  customer_name?: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_note?: string | null;
  total_amount?: number | null;
  status?: string | null;
  items_count?: number | null;
  items?: OrderItemRow[];
};

const STATUS_OPTIONS = ['Nová', 'Ve výrobě', 'Dokončeno', 'Zrušeno'];

export default function AdminOrderDetail({ orderId }: { orderId: number }) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditLogRow[]>([]);

  const token = () => localStorage.getItem('adminToken');

  const load = async () => {
    const t = token();
    if (!t) {
      setError('Chybí přihlášení.');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setOrder(null);
        setError(typeof data?.error === 'string' ? data.error : 'Objednávku nelze načíst.');
        return;
      }
      setOrder(data as OrderDetail);
      setStatus(String(data.status ?? 'Nová'));

      // Fetch audit log
      const auditRes = await fetch(`/api/admin/orders/${orderId}/audit`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (auditRes.ok) {
        setAuditLog(await auditRes.json());
      }
    } catch {
      setOrder(null);
      setError('Spojení se serverem selhalo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [orderId]);

  const saveStatus = async () => {
    const t = token();
    if (!t || !status) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${t}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data?.error === 'string' ? data.error : 'Uložení stavu selhalo.';
        setError(msg);
        toast.error(msg);
        return;
      }
      setOrder(data as OrderDetail);
      setError(null);
      toast.success('Stav byl úspěšně uložen.');
      // Refresh audit log to show the new entry
      const auditRes = await fetch(`/api/admin/orders/${orderId}/audit`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (auditRes.ok) {
        setAuditLog(await auditRes.json());
      }
    } catch {
      setError('Spojení selhalo.');
      toast.error('Spojení selhalo.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Načítám detail…</div>;
  }

  if (error && !order) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 mb-4">{error}</div>
        <a href="#/admin/orders" className="text-[#CCAD8A] font-bold inline-flex items-center gap-2">
          <ArrowLeft size={18} /> Zpět na seznam
        </a>
      </div>
    );
  }

  if (!order) return null;

  const items = order.items ?? [];

  return (
    <div className="max-w-5xl mx-auto">
      <a
        href="#/admin/orders"
        className="inline-flex items-center gap-2 text-[#CCAD8A] font-bold mb-6 hover:underline"
      >
        <ArrowLeft size={18} /> Objednávky
      </a>

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[#132333]">
            Objednávka {order.order_no ?? order.id}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {order.date ? new Date(order.date).toLocaleString('cs-CZ') : '—'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Stav</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#CCAD8A] outline-none"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={saveStatus}
            disabled={saving || status === (order.status ?? '')}
            className="bg-[#CCAD8A] text-[#132333] font-bold px-4 py-2 rounded-lg hover:bg-[#b5997a] disabled:opacity-50"
          >
            {saving ? 'Ukládám…' : 'Uložit stav'}
          </button>
          {items.some(it => (it.product_title || '').toLowerCase().includes('lagarta')) && (
            <button
              type="button"
              onClick={() => {
                const t = token();
                window.open(`/api/admin/orders/${order.id}/export-lagarta?token=${t}`, '_blank');
              }}
              className="bg-white text-green-700 border border-green-200 font-bold px-4 py-2 rounded-lg hover:bg-green-50 flex items-center gap-2"
            >
              <FileSpreadsheet size={18} />
              Exportovat Lagarta Excel
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="font-bold text-[#132333] mb-3">Zákazník</h2>
          <p className="font-medium">{order.customer_name}</p>
          {order.customer_email && (
            <p className="text-sm text-gray-600 mt-1">{order.customer_email}</p>
          )}
          {order.customer_phone && (
            <p className="text-sm text-gray-600">{order.customer_phone}</p>
          )}
          {order.customer_note && (
            <p className="text-sm text-gray-600 mt-3 whitespace-pre-line border-t border-gray-100 pt-3">
              {order.customer_note}
            </p>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="font-bold text-[#132333] mb-3">Souhrn</h2>
          <p className="text-sm text-gray-600">
            Položek: <strong>{order.items_count ?? items.reduce((s, i) => s + i.quantity, 0)}</strong>
          </p>
          <p className="text-2xl font-black text-[#132333] mt-2">
            {order.total_amount != null ? `${formatCzk(order.total_amount)} Kč` : '—'}{' '}
            <span className="text-sm font-normal text-gray-500">vč. DPH</span>
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <h2 className="font-bold text-[#132333] p-6 border-b border-gray-100">Položky</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
                <th className="py-3 px-4 font-semibold">Produkt</th>
                <th className="py-3 px-4 font-semibold">mm</th>
                <th className="py-3 px-4 font-semibold">Ks</th>
                <th className="py-3 px-4 font-semibold">Cena / ks</th>
                <th className="py-3 px-4 font-semibold">Řádek</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="py-3 px-4">
                    <div className="font-medium text-[#132333]">{it.product_title ?? `#${it.product_id}`}</div>
                    {it.options && Object.keys(it.options).length > 0 && (
                      <pre className="text-[10px] text-gray-400 mt-1 whitespace-pre-wrap max-w-xs overflow-hidden">
                        {JSON.stringify(it.options)}
                      </pre>
                    )}
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    {it.width_mm} × {it.height_mm}
                  </td>
                  <td className="py-3 px-4">{it.quantity}</td>
                  <td className="py-3 px-4">{formatCzk(it.unit_price_czk)} Kč</td>
                  <td className="py-3 px-4 font-semibold">{formatCzk(it.line_total_czk)} Kč</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length === 0 && (
          <p className="text-center text-gray-500 py-8 text-sm">Žádné řádky (starší objednávka).</p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mt-8">
        <h2 className="font-bold text-[#132333] p-6 border-b border-gray-100 flex items-center gap-2">
          <History size={20} />
          Historie změn (Audit Log)
        </h2>
        {auditLog.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
                  <th className="py-3 px-4 font-semibold">Datum a čas</th>
                  <th className="py-3 px-4 font-semibold">Akce</th>
                  <th className="py-3 px-4 font-semibold">Původní hodnota</th>
                  <th className="py-3 px-4 font-semibold">Nová hodnota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {auditLog.map((log) => (
                  <tr key={log.id}>
                    <td className="py-3 px-4 text-gray-600">
                      {new Date(log.timestamp).toLocaleString('cs-CZ')}
                    </td>
                    <td className="py-3 px-4 font-medium">
                      {log.action === 'status_change' ? 'Změna stavu' : log.action}
                    </td>
                    <td className="py-3 px-4 text-gray-500">
                      <span className="bg-gray-100 px-2 py-1 rounded">{log.old_value || '—'}</span>
                    </td>
                    <td className="py-3 px-4 font-bold text-[#132333]">
                      <span className="bg-[#CCAD8A]/20 text-[#132333] px-2 py-1 rounded">{log.new_value}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-6 text-gray-500 text-sm">Zatím nebyly zaznamenány žádné změny v Audit logu.</p>
        )}
      </div>
    </div>
  );
}
