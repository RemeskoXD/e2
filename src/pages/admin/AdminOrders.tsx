import { useState, useEffect } from 'react';
import { Search, Eye, RefreshCw, Download, LayoutList, LayoutGrid } from 'lucide-react';
import { formatCzk } from '../../lib/money';
import { downloadCsv } from '../../lib/downloadCsv';
import toast from 'react-hot-toast';

type OrderRow = {
  id: number;
  order_no?: string;
  date?: string;
  customer_name?: string;
  customer_email?: string | null;
  total_amount?: number | null;
  status?: string | null;
  items_count?: number | null;
  payment_method?: string | null;
  payment_status?: string | null;
};

const KANBAN_COLUMNS = ['Nová', 'Ve výrobě', 'Dokončeno', 'Zrušeno'];

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
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');

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

  const handleDragStart = (e: React.DragEvent, orderId: number) => {
    e.dataTransfer.setData('text/plain', String(orderId));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const orderIdStr = e.dataTransfer.getData('text/plain');
    const orderId = Number(orderIdStr);
    if (!orderId) return;

    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status === newStatus) return;

    const oldStatus = order.status;

    // Optimistic UI update
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));

    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Uložení selhalo.');
      }
      toast.success(`Objednávka přesunuta: ${newStatus}`);
    } catch (err: any) {
      // Revert optimistic update
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: oldStatus } : o)));
      toast.error(`Nepodařilo se přesunout objednávku: ${err.message}`);
    }
  };

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
    const headers = ['order_no', 'datum', 'zakaznik', 'email', 'polozek', 'celkem_kc', 'stav', 'platba', 'stav_platby'];
    const rows = filtered.map((o) => [
      String(o.order_no ?? o.id),
      formatOrderDate(o.date),
      String(o.customer_name ?? ''),
      String(o.customer_email ?? ''),
      String(o.items_count ?? ''),
      String(o.total_amount ?? ''),
      String(o.status ?? ''),
      String(o.payment_method ?? ''),
      String(o.payment_status ?? ''),
    ]);
    downloadCsv(`objednavky-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  if (loading) {
    return <div className="p-8 text-center">Načítám objednávky…</div>;
  }

  const statuses = [...new Set(orders.map((o) => o.status).filter(Boolean))] as string[];

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-80px)] flex flex-col">
      <div className="mb-6 shrink-0 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#132333]">Objednávky</h1>
          <p className="text-gray-500 mt-1">Data z databáze (tabulka Order). Změna stavu je zaznamenána v Audit logu.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="bg-gray-100 p-1 flex rounded-lg">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-colors ${
                viewMode === 'kanban' ? 'bg-white shadow-sm text-[#132333]' : 'text-gray-500 hover:text-[#132333]'
              }`}
            >
              <LayoutGrid size={16} /> Kanban
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-colors ${
                viewMode === 'table' ? 'bg-white shadow-sm text-[#132333]' : 'text-gray-500 hover:text-[#132333]'
              }`}
            >
              <LayoutList size={16} /> Tabulka
            </button>
          </div>
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
        <div className="mb-6 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-0 flex-1">
        <div className="p-4 border-b border-gray-100 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4">
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
          {viewMode === 'table' && (
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
          )}
        </div>

        {viewMode === 'kanban' ? (
          <div className="flex-1 overflow-x-auto p-4 bg-gray-50/50">
            <div className="flex gap-6 min-w-max h-full">
              {KANBAN_COLUMNS.map((colStatus) => {
                const columnOrders = filtered.filter((o) => o.status === colStatus);
                return (
                  <div
                    key={colStatus}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, colStatus)}
                    className="w-80 flex flex-col bg-gray-100/80 rounded-2xl border border-gray-200/60 overflow-hidden"
                  >
                    <div className="p-4 border-b border-gray-200/60 flex justify-between items-center bg-white/50">
                      <h3 className="font-bold text-[#132333] flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          colStatus === 'Nová' ? 'bg-orange-400' :
                          colStatus === 'Ve výrobě' ? 'bg-blue-400' :
                          colStatus === 'Dokončeno' ? 'bg-green-400' : 'bg-gray-400'
                        }`}></span>
                        {colStatus}
                      </h3>
                      <span className="text-xs font-bold text-gray-500 bg-gray-200 px-2 py-1 rounded-full">
                        {columnOrders.length}
                      </span>
                    </div>
                    <div className="p-3 flex-1 overflow-y-auto space-y-3">
                      {columnOrders.map((order) => (
                        <div
                          key={order.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, order.id)}
                          className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing hover:border-[#CCAD8A] transition-colors group"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-bold text-[#132333]">{order.order_no ?? order.id}</span>
                            <a
                              href={`#/admin/orders/${order.id}`}
                              title="Detail objednávky"
                              className="text-gray-400 hover:text-[#CCAD8A] transition-colors"
                            >
                              <Eye size={18} />
                            </a>
                          </div>
                          <div className="text-sm font-medium text-gray-700 truncate mb-1">
                            {order.customer_name ?? '—'}
                          </div>
                          <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-50">
                            <span className="text-xs font-bold text-gray-500">{formatOrderDate(order.date)}</span>
                            <span className="text-sm font-black text-[#132333]">
                              {order.total_amount != null ? formatCzk(order.total_amount) : '0'} Kč
                            </span>
                          </div>
                          {order.payment_method === 'card' && (
                            <div className="mt-2 text-[10px] font-bold uppercase px-2 py-1 rounded inline-block bg-gray-50 text-gray-500">
                              Karta • {order.payment_status}
                            </div>
                          )}
                        </div>
                      ))}
                      {columnOrders.length === 0 && (
                        <div className="h-full flex items-center justify-center text-sm font-medium text-gray-400 border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
                          Přetáhněte sem objednávku
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm">
                <tr className="text-gray-500 text-sm border-b border-gray-100">
                  <th className="py-4 px-6 font-semibold">Číslo obj.</th>
                  <th className="py-4 px-6 font-semibold">Datum</th>
                  <th className="py-4 px-6 font-semibold">Zákazník</th>
                  <th className="py-4 px-6 font-semibold hidden lg:table-cell">E-mail</th>
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
        )}
      </div>
    </div>
  );
}
