import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import { Lock, Menu } from 'lucide-react';
import AdminSidebar from './AdminSidebar';

export default function AdminLayout({ children, currentPath }: { children: ReactNode; currentPath: string }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('adminToken'));
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [currentPath]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });
      
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('adminToken', data.token);
        setToken(data.token);
      } else {
        setError(data.error || 'Přihlášení selhalo');
      }
    } catch (err) {
      setError('Nelze se spojit se serverem');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setToken(null);
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-[#F6F8F9] flex items-center justify-center p-6 text-sans">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full border border-gray-100">
          <div className="w-16 h-16 bg-[#CCAD8A]/10 text-[#CCAD8A] rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock size={32} />
          </div>
          <h2 className="text-2xl font-black text-center text-[#132333] mb-2 tracking-tight">Qapi Administrace</h2>
          <p className="text-center text-gray-500 mb-8 font-medium">Zadejte heslo pro pokračování</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Vaše admin heslo..."
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] focus:bg-white transition-all text-center font-medium"
              />
            </div>
            {error && <p className="text-red-500 text-sm text-center font-bold">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#132333] hover:bg-[#20344a] text-white font-bold py-3.5 rounded-xl transition-all shadow-md mt-4 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Ověřování...' : 'Přihlásit se'}
            </button>
            <div className="text-center mt-6">
              <a href="#/" className="text-sm text-gray-400 hover:text-[#132333] font-semibold transition-colors">
                Zpět na e-shop
              </a>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // When logged in:
  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      <AdminSidebar
        currentPath={currentPath}
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 lg:ml-72">
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-4 px-4 py-3 bg-[#132333] text-white shadow-md">
          <span className="font-black tracking-tight">
            Qapi <span className="text-[#CCAD8A]">Admin</span>
          </span>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20"
            aria-label="Otevřít menu"
          >
            <Menu size={22} />
          </button>
        </header>
        <main className="flex-1 p-6 lg:p-10 overflow-y-auto min-h-0">{children}</main>
      </div>
    </div>
  );
}

