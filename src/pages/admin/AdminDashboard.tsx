import { useState, useEffect } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  Area,
  ComposedChart,
} from 'recharts';
import { DollarSign, ShoppingCart, Users, Package, ArrowRight } from 'lucide-react';
import { formatCzk } from '../../lib/money';

type ChartRow = { day: string; name: string; trzby: number; objednavky: number };

type RecentOrder = {
  id: number;
  order_no?: string;
  date?: string;
  customer_name?: string;
  customer_email?: string | null;
  total_amount?: number | null;
  status?: string | null;
  items_count?: number | null;
};

type StatsResponse = {
  products_count: number;
  categories_count: number;
  orders_count: number;
  orders_total_czk: number;
  customers_count: number;
  chart_last_7_days: ChartRow[];
  recent_orders: RecentOrder[];
};

function formatShortDate(isoOrString: string | undefined): string {
  if (!isoOrString) return '—';
  const d = new Date(isoOrString);
  if (Number.isNaN(d.getTime())) return String(isoOrString).slice(0, 10);
  return d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    const load = async () => {
      setLoadErr(null);
      try {
        const res = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) {
          setStats(null);
          setLoadErr(typeof data?.error === 'string' ? data.error : 'Statistiky se nepodařilo načíst.');
          return;
        }
        setStats(data as StatsResponse);
      } catch {
        setStats(null);
        setLoadErr('Nelze načíst přehled z databáze.');
      }
    };
    load();
  }, []);

  const totalLabel =
    stats != null ? `${formatCzk(stats.orders_total_czk)} Kč` : '—';
  const ordersLabel = stats != null ? String(stats.orders_count) : '—';
  const customersLabel = stats != null ? String(stats.customers_count) : '—';
  const catalogLabel =
    stats != null ? `${stats.products_count} / ${stats.categories_count}` : '—';

  const chartData = stats?.chart_last_7_days?.length ? stats.chart_last_7_days : [];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#132333]">Přehled</h1>
        <p className="text-gray-500 mt-1">
          Čísla z databáze v reálném čase. Graf zobrazuje objednávky a tržby vč. DPH za posledních 7 dní.
        </p>
      </div>

      {loadErr && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadErr}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { title: 'Obrat objednávek (vč. DPH)', value: totalLabel, icon: <DollarSign size={24} /> },
          { title: 'Počet objednávek', value: ordersLabel, icon: <ShoppingCart size={24} /> },
          { title: 'Zákazníci v DB', value: customersLabel, icon: <Users size={24} /> },
          {
            title: 'Katalog (produkty / kategorie)',
            value: catalogLabel,
            icon: <Package size={24} />,
            hint: 'produkty a kategorie',
          },
        ].map((item, i) => (
          <div
            key={i}
            className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-start justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-gray-500 mb-1">{item.title}</p>
              <h3 className="text-2xl font-bold text-[#132333]">{item.value}</h3>
              {'hint' in item && item.hint && (
                <p className="text-xs text-gray-400 mt-2">{item.hint}</p>
              )}
            </div>
            <div className="w-12 h-12 rounded-full bg-[#132333]/5 text-[#CCAD8A] flex items-center justify-center shrink-0">
              {item.icon}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        <div className="xl:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-[#132333] mb-2">Tržby a počet objednávek (7 dní)</h2>
          <p className="text-sm text-gray-500 mb-6">Sloupce = počet objednávek, čára = součet vč. DPH (Kč).</p>
          <div className="h-[360px] w-full">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                Žádná data za vybrané období.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTrzbyDash" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#CCAD8A" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#CCAD8A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} dy={10} />
                  <YAxis
                    yAxisId="left"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#9CA3AF' }}
                    tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} />
                  <CartesianGrid vertical={false} stroke="#F3F4F6" />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                    labelStyle={{ fontWeight: 'bold', color: '#132333' }}
                    formatter={(value: number, name: string) =>
                      name === 'trzby' ? [`${formatCzk(value)} Kč`, 'Tržby'] : [value, 'Objednávky']
                    }
                  />
                  <Bar yAxisId="right" dataKey="objednavky" fill="#132333" opacity={0.15} radius={[4, 4, 0, 0]} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="trzby"
                    stroke="#CCAD8A"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorTrzbyDash)"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[#132333]">Poslední objednávky</h2>
            <a
              href="#/admin/orders"
              className="text-sm font-bold text-[#CCAD8A] hover:underline inline-flex items-center gap-1"
            >
              Vše <ArrowRight size={16} />
            </a>
          </div>
          {!stats?.recent_orders?.length ? (
            <p className="text-sm text-gray-500">Zatím žádné objednávky.</p>
          ) : (
            <ul className="space-y-3">
              {stats.recent_orders.map((o) => (
                <li key={o.id}>
                  <a
                    href={`#/admin/orders/${o.id}`}
                    className="block rounded-xl border border-gray-100 p-3 hover:border-[#CCAD8A]/50 hover:bg-[#CCAD8A]/5 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-[#132333] text-sm">{o.order_no ?? `#${o.id}`}</span>
                      <span className="text-xs text-gray-400 whitespace-nowrap">{formatShortDate(o.date)}</span>
                    </div>
                    <p className="text-xs text-gray-600 truncate mt-1">{o.customer_name ?? '—'}</p>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs font-semibold text-[#CCAD8A]">{o.status ?? '—'}</span>
                      <span className="text-sm font-black text-[#132333]">
                        {o.total_amount != null ? `${formatCzk(o.total_amount)} Kč` : '—'}
                      </span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
