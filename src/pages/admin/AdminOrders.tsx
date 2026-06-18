import { useState, useEffect } from 'react';
import { Search, Eye, RefreshCw, Download } from 'lucide-react';
import { formatCzk } from '../../lib/money';
import { downloadCsv } from '../../lib/downloadCsv';

type OrderRow = {
  id: number;
  order_no?: string;
  date?: string;
  customer_name?: string;
  customer_email?: string | null;
  total_amount?: number | null;
  status?: string | null;
  items_count?: number | null;
};

function formatOrderDate(isoOrString: string | undefined): string {
  if (!isoOrString) return '—';
  const d = new Date(isoOrString);
  if (Number.isNaN(d.getTime())) return String(isoOrString).slice(0, 10);
  return d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchOrders = async (isRefresh = false) => {
    setError(null);
    if (isRefresh) setRefreshing(true);
    const token = localStorage.getItem('adminToken');
    if (!token) {
      setOrders([]);
      setError('Chybí přihlášení.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const res = await fetch('/api/admin/orders', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setOrders([]);
        setError(typeof data?.error === 'string' ? data.error : 'Objednávky se nepodařilo načíst.');
        return;
      }
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setOrders([]);
      setError('Nelze se spojit se serverem.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const q = searchQuery.trim().toLowerCase();
  const filtered = orders.filter((o) => {
    const no = String(o.order_no ?? '').toLowerCase();
    const cust = String(o.customer_name ?? '').toLowerCase();
    const em = String(o.customer_email ?? '').toLowerCase();
    const st = String(o.status ?? '');
    const matchSearch = !q || no.includes(q) || cust.includes(q) || em.includes(q);
    const matchStatus = !statusFilter || st === statusFilter;
    return matchSearch && matchStatus;
  });

  const exportFilteredCsv = () => {
    if (filtered.length === 0) return;
    const headers = [
      'order_no',
      'datum',
      'zakaznik',
      'email',
      'polozek',
      'celkem_kc',
      'stav',
    ];
    const rows = filtered.map((o) => [
      String(o.order_no ?? o.id),
      formatOrderDate(o.date),
      String(o.customer_name ?? ''),
      String(o.customer_email ?? ''),
      String(o.items_count ?? ''),
      String(o.total_amount ?? ''),
      String(o.status ?? ''),
    ]);
    downloadCsv(`objednavky-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  if (loading) {
    return <div className="p-8 text-center">Načítám objednávky…</div>;
  }

  const statuses = [...new Set(orders.map((o) => o.status).filter(Boolean))] as string[];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#132333]">Objednávky</h1>
          <p className="text-gray-500 mt-1">Data z databáze (tabulka Order).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fetchOrders(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 bg-white border border-gray-200 text-[#132333] font-semibold px-4 py-2.5 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            Obnovit
          </button>
          <button
            type="button"
            onClick={exportFilteredCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 bg-[#132333] text-white font-semibold px-4 py-2.5 rounded-lg hover:bg-[#1a3145] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={18} />
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {!error && orders.length === 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          Zatím žádné objednávky v databázi.
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Číslo, jméno nebo e-mail…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] focus:bg-white transition-all"
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-gray-200 text-gray-700 py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] text-sm font-semibold w-full sm:w-auto"
            >
              <option value="">Všechny stavy</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-100">
                <th className="py-4 px-6 font-semibold">Číslo obj.</th>
                <th className="py-4 px-6 font-semibold">Datum</th>
                <th className="py-4 px-6 font-semibold">Zákazník</th>
                <th className="py-4 px-6 font-semibold hidden lg:table-cell">E-mail</th>
                <th className="py-4 px-6 font-semibold">Položek</th>
                <th className="py-4 px-6 font-semibold">Celkem</th>
                <th className="py-4 px-6 font-semibold">Stav</th>
                <th className="py-4 px-6 font-semibold text-right">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-[#132333] font-medium text-sm">
              {filtered.map((order) => {
                const total = order.total_amount != null ? formatCzk(order.total_amount) : '—';
                const status = order.status ?? '—';
                return (
                  <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-6 font-bold">{order.order_no ?? order.id}</td>
                    <td className="py-4 px-6 text-gray-500">{formatOrderDate(order.date)}</td>
                    <td className="py-4 px-6">
                      <div className="font-medium">{order.customer_name ?? '—'}</div>
                      {order.customer_email && (
                        <div className="text-xs text-gray-500 lg:hidden truncate max-w-[200px]">
                          {order.customer_email}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-6 text-gray-500 text-sm hidden lg:table-cell max-w-[200px] truncate">
                      {order.customer_email ?? '—'}
                    </td>
                    <td className="py-4 px-6 text-gray-500">
                      {order.items_count != null ? `${order.items_count}×` : '—'}
                    </td>
                    <td className="py-4 px-6 font-bold">{total} Kč</td>
                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex py-1 px-2.5 rounded text-xs font-bold uppercase tracking-wide
                      ${
                        status === 'Nová'
                          ? 'bg-orange-50 text-orange-600 border border-orange-100'
                          : status === 'Ve výrobě'
                            ? 'bg-blue-50 text-blue-600 border border-blue-100'
                            : status === 'Dokončeno'
                              ? 'bg-green-50 text-green-600 border border-green-100'
                              : 'bg-gray-100 text-gray-600 border border-gray-200'
                      }
                    `}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <a
                        href={`#/admin/orders/${order.id}`}
                        title="Detail objednávky"
                        className="p-2 text-[#CCAD8A] hover:text-[#b5997a] hover:bg-[#CCAD8A]/10 transition-colors rounded-lg font-bold inline-flex items-center gap-2"
                      >
                        <Eye size={18} />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
