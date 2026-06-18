import { useState, useEffect } from 'react';
import { Search, Mail, Phone, Download } from 'lucide-react';
import { formatCzk } from '../../lib/money';
import { downloadCsv } from '../../lib/downloadCsv';

type CustomerRow = {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
  orders_count?: number | null;
  total_spent?: number | null;
  registered?: string;
};

function formatRegistered(isoOrString: string | undefined): string {
  if (!isoOrString) return '—';
  const d = new Date(isoOrString);
  if (Number.isNaN(d.getTime())) return String(isoOrString).slice(0, 10);
  return d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchCustomers = async () => {
    setError(null);
    const token = localStorage.getItem('adminToken');
    if (!token) {
      setCustomers([]);
      setError('Chybí přihlášení.');
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/admin/customers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setCustomers([]);
        setError(typeof data?.error === 'string' ? data.error : 'Zákazníky se nepodařilo načíst.');
        return;
      }
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      setCustomers([]);
      setError('Nelze se spojit se serverem.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  if (loading) {
    return <div className="p-8 text-center">Načítám zákazníky…</div>;
  }

  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? customers.filter((c) => {
        const blob = [c.name, c.email, c.phone].map((x) => String(x ?? '').toLowerCase()).join(' ');
        return blob.includes(q);
      })
    : customers;

  const exportCsv = () => {
    if (filtered.length === 0) return;
    const headers = ['jmeno', 'email', 'telefon', 'registrovan', 'pocet_obj', 'utrata_kc'];
    const rows = filtered.map((c) => [
      String(c.name ?? ''),
      String(c.email ?? ''),
      String(c.phone ?? ''),
      formatRegistered(c.registered),
      String(c.orders_count ?? 0),
      String(c.total_spent ?? 0),
    ]);
    downloadCsv(`zakaznici-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#132333]">Zákazníci</h1>
          <p className="text-gray-500 mt-1">Data z databáze (tabulka Customer).</p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="bg-[#132333] text-white font-bold px-4 py-2.5 rounded-lg flex items-center gap-2 hover:bg-[#1a3145] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={18} />
          Export CSV ({filtered.length})
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {!error && customers.length === 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          Zatím žádní zákazníci v databázi.
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center">
          <div className="relative w-full sm:w-80">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Jméno, e-mail, telefon…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] focus:bg-white transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-100">
                <th className="py-4 px-6 font-semibold">Jméno / Firma</th>
                <th className="py-4 px-6 font-semibold">Kontakt</th>
                <th className="py-4 px-6 font-semibold">Registrován</th>
                <th className="py-4 px-6 font-semibold text-center">Počet obj.</th>
                <th className="py-4 px-6 font-semibold text-right">Celková útrata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-[#132333] font-medium text-sm">
              {filtered.map((cust) => (
                <tr key={cust.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-4 px-6 font-bold">{cust.name ?? '—'}</td>
                  <td className="py-4 px-6">
                    <div className="flex flex-col space-y-1">
                      {cust.email && (
                        <a
                          href={`mailto:${cust.email}`}
                          className="text-[#CCAD8A] hover:underline flex items-center gap-1.5"
                        >
                          <Mail size={14} /> {cust.email}
                        </a>
                      )}
                      {cust.phone && (
                        <a
                          href={`tel:${cust.phone}`}
                          className="text-gray-500 hover:text-[#132333] flex items-center gap-1.5"
                        >
                          <Phone size={14} /> {cust.phone}
                        </a>
                      )}
                      {!cust.email && !cust.phone && <span className="text-gray-400">—</span>}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-gray-500">{formatRegistered(cust.registered)}</td>
                  <td className="py-4 px-6 text-center">
                    <span className="inline-flex w-8 h-8 rounded-full bg-gray-100 items-center justify-center font-bold text-gray-600">
                      {cust.orders_count ?? 0}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right font-black text-[#132333]">
                    {formatCzk(cust.total_spent ?? 0)} Kč
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
