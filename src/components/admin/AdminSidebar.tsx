import {
  LayoutDashboard,
  Package,
  Folders,
  ShoppingCart,
  Users,
  Settings,
  LogOut,
  Grid3x3,
  X,
  Ruler,
  Palette,
  Home,
  Star,
} from 'lucide-react';

export default function AdminSidebar({
  currentPath,
  onLogout,
  mobileOpen,
  onCloseMobile,
}: {
  currentPath: string;
  onLogout?: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const navItems = [
    { path: '#/admin', icon: <LayoutDashboard size={20} />, label: 'Přehled a Analytika' },
    { path: '#/admin/homepage', icon: <Home size={20} />, label: 'Úvodní stránka' },
    { path: '#/admin/reviews', icon: <Star size={20} />, label: 'Reference' },
    { path: '#/admin/product-reviews', icon: <Star size={20} />, label: 'Recenze produktů' },
    { path: '#/admin/orders', icon: <ShoppingCart size={20} />, label: 'Objednávky' },
    { path: '#/admin/products', icon: <Package size={20} />, label: 'Produkty a Ceníky' },
    { path: '#/admin/brackets', icon: <Grid3x3 size={20} />, label: 'Mřížka ceníku' },
    { path: '#/admin/categories', icon: <Folders size={20} />, label: 'Kategorie' },
    { path: '#/admin/fabric-groups', icon: <Palette size={20} />, label: 'Skupiny látek' },
    { path: '#/admin/customers', icon: <Users size={20} />, label: 'Zákazníci' },
    { path: '#/admin/settings', icon: <Settings size={20} />, label: 'Nastavení e-shopu' },
    { path: '#/admin/measure-guide', icon: <Ruler size={20} />, label: 'Jak zaměřit' },
  ];

  const panel = (
    <>
      <div className="p-6 lg:p-8 border-b border-white/10 flex items-center justify-between gap-4">
        <h2 className="text-2xl lg:text-3xl font-black text-white tracking-tight">
          Qapi <span className="text-[#CCAD8A]">Admin</span>
        </h2>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-2 rounded-lg text-white/80 hover:bg-white/10"
          aria-label="Zavřít menu"
        >
          <X size={22} />
        </button>
      </div>
      <nav className="flex-1 py-6 lg:py-8 px-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            currentPath === item.path ||
            (item.path === '#/admin/orders' && /^#\/admin\/orders\/\d+/.test(currentPath));
          return (
            <a
              key={item.path}
              href={item.path}
              onClick={onCloseMobile}
              className={`flex items-center gap-3 px-5 py-3.5 rounded-xl transition-all duration-300 ${
                isActive
                  ? 'bg-[#CCAD8A] text-[#132333] font-bold shadow-lg shadow-[#CCAD8A]/20'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white font-medium'
              }`}
            >
              <span className={isActive ? 'text-[#132333]' : 'text-gray-400'}>{item.icon}</span>
              {item.label}
            </a>
          );
        })}
      </nav>
      <div className="p-6 lg:p-8 border-t border-white/10 space-y-4 shrink-0">
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-3 text-red-400 hover:text-red-300 transition-colors font-medium"
        >
          <LogOut size={20} />
          Odhlásit se
        </button>
        <a
          href="#/"
          onClick={onCloseMobile}
          className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors font-medium"
        >
          Zpět na e-shop
        </a>
      </div>
    </>
  );

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden ${
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!mobileOpen}
        onClick={onCloseMobile}
      />
      <aside
        className={`fixed left-0 top-0 z-50 w-72 max-w-[85vw] min-h-screen flex flex-col bg-[#132333] text-white shadow-xl transition-transform duration-300 ease-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        {panel}
      </aside>
    </>
  );
}
