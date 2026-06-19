import { useState, useEffect, type FormEvent } from 'react';
import { Plus, Search, Edit2, Trash2, Terminal, ChevronDown, ChevronRight, X, ExternalLink, Table, Image as ImageIcon, Upload, GripVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { computeDisplayPriceCzk, formatCzk, toMoneyNumber } from '../../lib/money';
import { CENIK_IMPORT_COMMANDS } from '../../lib/cenikImportCommands';
import RichTextEditor from '../../components/RichTextEditor';
import AdminPriceMatrixModal from '../../components/admin/AdminPriceMatrixModal';
import AdminMassEditBar from '../../components/admin/AdminMassEditBar';
import { uploadImage } from '../../lib/imageHelpers';

interface DimConstraints {
  width_mm_min: number;
  width_mm_max: number;
  height_mm_min: number;
  height_mm_max: number;
  max_area_m2: number | null;
}

export interface FabricGroupConfigItem {
  name: string;
  surcharge: number;
  surcharge_percent?: number; // legacy
  colors: { name: string; img?: string }[];
}

export interface ParameterOption {
  label: string;
  value: string;
  colorCode?: string;
  img?: string;
  priceVariant?: number;
}

export interface ProductParameter {
  id: string;
  name: string;
  type: 'select' | 'color_array' | 'numeric';
  options: ParameterOption[];
  condition?: {
    dependsOnParamId: string;
    allowedValues: string[];
  };
  numericSettings?: {
    min?: number;
    max?: number;
    defaultValue?: number;
  };
}

interface Product {
  id: number | string;
  slug?: string;
  title: string;
  category: string;
  price: number;
  oldPrice?: number;
  badge?: string;
  img: string;
  desc: string;
  supplier_markup_percent?: number;
  commission_percent?: number;
  display_price?: number;
  dimension_constraints?: DimConstraints | null;
  width_mm_min?: number | null;
  width_mm_max?: number | null;
  height_mm_min?: number | null;
  height_mm_max?: number | null;
  max_area_m2?: number | null;
  price_mode?: string | null;
  fabric_group?: number | null;
  validation_profile?: string | null;
  hidden?: boolean;
  gallery?: string[];
  colors?: { name: string; img?: string }[];
  extras?: { id: string; name: string; price: number }[];
  parameters?: ProductParameter[];
  fabric_groups_config?: FabricGroupConfigItem[] | null;
}

/** Formulář v modalu — prázdné numerické pole jako '' před odesláním na API. */
type AdminProductForm = Partial<Omit<Product, 'width_mm_min' | 'width_mm_max' | 'height_mm_min' | 'height_mm_max' | 'max_area_m2' | 'fabric_group'>> & {
  width_mm_min?: number | '' | null;
  width_mm_max?: number | '' | null;
  height_mm_min?: number | '' | null;
  height_mm_max?: number | '' | null;
  max_area_m2?: number | '' | null;
  fabric_group?: number | string | '' | null;
  gallery?: string[];
  colors?: { name: string; img?: string }[];
  extras?: { id: string; name: string; price: number }[];
  parameters?: ProductParameter[];
  fabric_groups_config?: FabricGroupConfigItem[] | null;
};

function formatDimsMm(p: Product): string {
  const d = p.dimension_constraints;
  if (d) {
    return `${d.width_mm_min}–${d.width_mm_max} × ${d.height_mm_min}–${d.height_mm_max} mm`;
  }
  if (
    p.width_mm_min != null &&
    p.width_mm_max != null &&
    p.height_mm_min != null &&
    p.height_mm_max != null
  ) {
    return `${p.width_mm_min}–${p.width_mm_max} × ${p.height_mm_min}–${p.height_mm_max} mm`;
  }
  return '—';
}

function SortableParameterItem(props: { id: string; children: React.ReactNode; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: props.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className="relative group border border-gray-200 rounded-xl p-4 bg-white shadow-sm">
      <div {...attributes} {...listeners} className="absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-300 hover:text-[#CCAD8A] hover:bg-gray-50 rounded-l-xl transition-colors">
        <GripVertical size={20} />
      </div>
      <button
        type="button"
        onClick={props.onRemove}
        className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors z-10"
        title="Odebrat parametr"
      >
        <Trash2 size={16} />
      </button>
      <div className="pl-6 pr-6">
        {props.children}
      </div>
    </div>
  );
}

function SortableOptionItem(props: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: props.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className="flex gap-2 items-center bg-gray-50 border border-gray-200 p-2 rounded-lg relative">
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-[#CCAD8A] px-1 py-2">
        <GripVertical size={16} />
      </div>
      <div className="flex-1 flex gap-2 items-center">
        {props.children}
      </div>
    </div>
  );
}

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; slug?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [importHelpOpen, setImportHelpOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());

  const [priceMatrixProduct, setPriceMatrixProduct] = useState<Product | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [formData, setFormData] = useState<AdminProductForm>({
    title: '',
    category: '',
    price: 0,
    oldPrice: undefined,
    badge: '',
    img: '',
    desc: '',
    supplier_markup_percent: 0,
    commission_percent: 0,
    width_mm_min: '',
    width_mm_max: '',
    height_mm_min: '',
    height_mm_max: '',
    max_area_m2: '',
    price_mode: '',
    fabric_group: '',
    validation_profile: '',
    hidden: false,
    gallery: [],
    extras: [],
    parameters: [],
  });

  const fetchData = async () => {
    setFetchError(null);
    try {
      const adminToken = localStorage.getItem('adminToken') || '';
      const [resProd, resCat] = await Promise.all([
        fetch('/api/admin/products', { headers: { Authorization: `Bearer ${adminToken}` } }),
        fetch('/api/categories'),
      ]);
      const dataProd = await resProd.json();
      const dataCat = await resCat.json();
      if (!resProd.ok) {
        setProducts([]);
        setFetchError(typeof dataProd?.error === 'string' ? dataProd.error : 'Nepodařilo se načíst produkty.');
        return;
      }
      if (Array.isArray(dataProd)) {
        setProducts(dataProd as Product[]);
      } else {
        setProducts([]);
        setFetchError('Odpověď serveru není seznam produktů.');
      }
      if (Array.isArray(dataCat)) {
        setCategories(dataCat);
      }
    } catch {
      setProducts([]);
      setFetchError('Nelze se spojit se serverem (zkontrolujte, že běží aplikace a DATABASE_URL).');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = fetchData; // pro zpětnou kompatibilitu

  useEffect(() => {
    fetchData();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEndParams = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFormData(prev => {
        if (!prev.parameters) return prev;
        const oldIndex = prev.parameters.findIndex(p => p.id === active.id);
        const newIndex = prev.parameters.findIndex(p => p.id === over.id);
        return { ...prev, parameters: arrayMove(prev.parameters, oldIndex, newIndex) };
      });
    }
  };

  const handleDragEndOptions = (pIdx: number, event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFormData(prev => {
        if (!prev.parameters) return prev;
        const newParams = structuredClone(prev.parameters);
        const oldIndex = newParams[pIdx].options.findIndex((o: any) => o.value === active.id);
        const newIndex = newParams[pIdx].options.findIndex((o: any) => o.value === over.id);
        newParams[pIdx].options = arrayMove(newParams[pIdx].options, oldIndex, newIndex);
        return { ...prev, parameters: newParams };
      });
    }
  };

  const customerPrice = (p: Product) =>
    p.display_price != null && Number.isFinite(p.display_price)
      ? p.display_price
      : computeDisplayPriceCzk(
          p.price,
          p.supplier_markup_percent ?? 0,
          p.commission_percent ?? 0
        );

  const dimToForm = (product: Product) => {
    const d = product.dimension_constraints;
    if (d) {
      return {
        width_mm_min: d.width_mm_min,
        width_mm_max: d.width_mm_max,
        height_mm_min: d.height_mm_min,
        height_mm_max: d.height_mm_max,
        max_area_m2:
          d.max_area_m2 != null && Number.isFinite(d.max_area_m2) ? d.max_area_m2 : ('' as const),
      };
    }
    if (product.width_mm_min != null && product.width_mm_max != null) {
      return {
        width_mm_min: toMoneyNumber(product.width_mm_min),
        width_mm_max: toMoneyNumber(product.width_mm_max),
        height_mm_min: toMoneyNumber(product.height_mm_min),
        height_mm_max: toMoneyNumber(product.height_mm_max),
        max_area_m2:
          product.max_area_m2 != null && Number.isFinite(Number(product.max_area_m2))
            ? toMoneyNumber(product.max_area_m2)
            : ('' as const),
      };
    }
    return {
      width_mm_min: '' as const,
      width_mm_max: '' as const,
      height_mm_min: '' as const,
      height_mm_max: '' as const,
      max_area_m2: '' as const,
    };
  };

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingId(product.id);
      const dim = dimToForm(product);
      setFormData({
        title: product.title,
        category: product.category,
        price: toMoneyNumber(product.price),
        oldPrice: product.oldPrice != null ? toMoneyNumber(product.oldPrice) : undefined,
        badge: product.badge,
        img: product.img,
        desc: product.desc,
        supplier_markup_percent: toMoneyNumber(product.supplier_markup_percent),
        commission_percent: toMoneyNumber(product.commission_percent),
        ...dim,
        price_mode: product.price_mode ?? '',
        fabric_group: product.fabric_group != null ? String(product.fabric_group) : '',
        validation_profile: product.validation_profile ?? '',
        hidden: Boolean(product.hidden),
        gallery: product.gallery || [],
        extras: product.extras || [],
        parameters: product.parameters || [],
      });
    } else {
      setEditingId(null);
      setFormData({
        title: '',
        category: '',
        price: 0,
        oldPrice: undefined,
        badge: '',
        img: '',
        desc: '',
        supplier_markup_percent: 4.9,
        commission_percent: 0,
        width_mm_min: '',
        width_mm_max: '',
        height_mm_min: '',
        height_mm_max: '',
        max_area_m2: '',
        price_mode: '',
        fabric_group: '',
        validation_profile: '',
        hidden: false,
        gallery: [],
        extras: [],
        parameters: [],
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('adminToken');
    if (!token) return toast.error('No admin token');

    try {
      const url = editingId ? `/api/admin/products/${editingId}` : '/api/admin/products';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
          supplier_markup_percent: toMoneyNumber(formData.supplier_markup_percent),
          commission_percent: toMoneyNumber(formData.commission_percent),
          width_mm_min: formData.width_mm_min === '' ? null : formData.width_mm_min,
          width_mm_max: formData.width_mm_max === '' ? null : formData.width_mm_max,
          height_mm_min: formData.height_mm_min === '' ? null : formData.height_mm_min,
          height_mm_max: formData.height_mm_max === '' ? null : formData.height_mm_max,
          max_area_m2: formData.max_area_m2 === '' ? null : formData.max_area_m2,
          price_mode:
            formData.price_mode === '' || formData.price_mode == null
              ? 'matrix_cell'
              : formData.price_mode,
          fabric_group:
            formData.fabric_group === '' || formData.fabric_group == null
              ? null
              : Number(formData.fabric_group),
          validation_profile:
            formData.validation_profile === '' || formData.validation_profile == null
              ? null
              : formData.validation_profile,
          extras: formData.extras || [],
          parameters: formData.parameters || [],
        }),
      });

      if (res.ok) {
        handleCloseModal();
        fetchProducts();
      } else {
        let msg = 'Chyba při ukládání produktu';
        try {
          const errBody = await res.json();
          if (typeof errBody?.error === 'string') msg = errBody.error;
        } catch {
          /* ignore */
        }
        toast.error(msg);
      }
    } catch {
      toast.error('Chyba serveru');
    }
  };

  const handleDelete = async (id: string | number) => {
    if (!confirm('Opravdu smazat tento produkt?')) return;
    const token = localStorage.getItem('adminToken');
    if (!token) return toast.error('No admin token');

    try {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchProducts();
      } else {
        toast.error('Chyba při mazání');
      }
    } catch {
      toast.error('Chyba serveru');
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Načítám produkty...</div>;
  }

  const q = searchQuery.trim().toLowerCase();
  const filteredProducts = q
    ? products.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.category && p.category.toLowerCase().includes(q)) ||
          (p.price_mode && String(p.price_mode).toLowerCase().includes(q)) ||
          (p.validation_profile && p.validation_profile.toLowerCase().includes(q))
      )
    : products;

  const handleDeleteSelected = async () => {
    if (!confirm(`Opravdu chcete smazat ${selectedIds.size} produktů?`)) return;
    const adminToken = localStorage.getItem('adminToken') || '';
    let successCount = 0;
    for (const id of selectedIds) {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.ok) successCount++;
    }
    toast.success(`Smazáno ${successCount} z ${selectedIds.size} produktů.`);
    setSelectedIds(new Set());
    fetchData();
  };

  const handleSetHiddenStatus = async (hidden: boolean) => {
    const adminToken = localStorage.getItem('adminToken') || '';
    let successCount = 0;
    for (const id of selectedIds) {
      const p = products.find(x => x.id === id);
      if (!p) continue;
      // Partial update via existing PUT endpoint requires us to send all fields.
      // So we will reconstruct the product form data.
      const payload = {
        title: p.title,
        category: p.category,
        price: p.price,
        oldPrice: p.oldPrice,
        badge: p.badge,
        img: p.img,
        desc: p.desc,
        supplier_markup_percent: p.supplier_markup_percent,
        commission_percent: p.commission_percent,
        ...p.dimension_constraints,
        price_mode: p.price_mode,
        fabric_group: p.fabric_group,
        validation_profile: p.validation_profile,
        gallery: p.gallery,
        hidden
      };
      const res = await fetch(`/api/admin/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) successCount++;
    }
    toast.success(`Změněno ${successCount} z ${selectedIds.size} produktů.`);
    setSelectedIds(new Set());
    fetchData();
  };

  return (
    <div className="max-w-7xl mx-auto">
      <AdminMassEditBar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onDelete={handleDeleteSelected}
        onHide={() => handleSetHiddenStatus(true)}
        onShow={() => handleSetHiddenStatus(false)}
      />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#132333]">Produkty a Ceníky</h1>
          <p className="text-gray-500 mt-1">
            Data výhradně z databáze. Limity rozměrů a kalkulačka API používají{' '}
            <span className="font-semibold text-[#132333]">milimetry (mm)</span>.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setImportHelpOpen((o) => !o)}
            className="bg-white border border-gray-200 text-[#132333] hover:bg-gray-50 font-bold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <Terminal size={18} />
            Import ceníků (npm)
            {importHelpOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
          <button
            type="button"
            onClick={() => handleOpenModal()}
            className="bg-[#CCAD8A] hover:bg-[#b5997a] text-[#132333] font-bold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <Plus size={18} />
            Nový produkt
          </button>
        </div>
      </div>

      {importHelpOpen && (
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-600 mb-3">
            Spusťte v kořeni projektu (s proměnnou <code className="text-xs bg-gray-100 px-1 rounded">DATABASE_URL</code> v{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">.env</code>). Po importu obnovte tuto stránku.
          </p>
          <ul className="space-y-2 text-sm font-mono text-[#132333]">
            {CENIK_IMPORT_COMMANDS.map((row) => (
              <li key={row.command} className="flex flex-col sm:flex-row sm:items-baseline gap-1 border-b border-gray-50 pb-2 last:border-0">
                <span className="shrink-0 font-semibold">{row.command}</span>
                <span className="text-gray-500 sm:ml-2 font-sans text-xs sm:text-sm">— {row.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {fetchError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {fetchError}
        </div>
      )}

      {!fetchError && products.length === 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          V databázi zatím nejsou žádné produkty. Použijte výše uvedené příkazy{' '}
          <span className="font-semibold">npm run import:…</span> nebo přidejte produkt ručně.
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-xs">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Vyhledat produkt…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] focus:bg-white transition-all"
            />
          </div>
          <div className="text-sm font-semibold text-gray-500">
            Zobrazeno: {filteredProducts.length}
            {q ? ` / ${products.length}` : ''} produktů
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-100">
                <th className="py-4 px-6 font-semibold w-12">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 text-[#CCAD8A] focus:ring-[#CCAD8A]"
                    checked={filteredProducts.length > 0 && selectedIds.size === filteredProducts.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(filteredProducts.map(p => p.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                  />
                </th>
                <th className="py-4 px-6 font-semibold">Produkt</th>
                <th className="py-4 px-6 font-semibold">Kategorie</th>
                <th className="py-4 px-6 font-semibold">Rozměry (mm)</th>
                <th className="py-4 px-6 font-semibold">Základ (ceník)</th>
                <th className="py-4 px-6 font-semibold">Navýšení %</th>
                <th className="py-4 px-6 font-semibold">Provize %</th>
                <th className="py-4 px-6 font-semibold">Cena pro zákazníka</th>
                <th className="py-4 px-6 font-semibold text-right">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-[#132333] font-medium text-sm">
              {filteredProducts.map((prod) => (
                <tr key={prod.id} className={`hover:bg-gray-50/50 transition-colors ${prod.hidden ? 'opacity-50 grayscale-[50%]' : ''}`}>
                  <td className="py-4 px-6">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300 text-[#CCAD8A] focus:ring-[#CCAD8A]"
                      checked={selectedIds.has(prod.id)}
                      onChange={(e) => {
                        const next = new Set(selectedIds);
                        if (e.target.checked) next.add(prod.id);
                        else next.delete(prod.id);
                        setSelectedIds(next);
                      }}
                    />
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-4">
                      <img
                        src={prod.img}
                        alt={prod.title}
                        className="w-12 h-12 rounded object-cover border border-gray-200 shrink-0"
                      />
                      <div>
                        <span className="font-bold inline-flex items-center gap-2">
                          {prod.title}
                          {prod.hidden && <span className="bg-gray-200 text-gray-600 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">Skryto</span>}
                        </span>
                        {prod.price_mode && (
                          <span className="text-xs text-gray-400 font-normal block">{prod.price_mode}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-gray-500">{prod.category}</td>
                  <td className="py-4 px-6 text-xs text-gray-600 whitespace-nowrap">{formatDimsMm(prod)}</td>
                  <td className="py-4 px-6">{formatCzk(prod.price)} Kč</td>
                  <td className="py-4 px-6">{toMoneyNumber(prod.supplier_markup_percent)} %</td>
                  <td className="py-4 px-6">{toMoneyNumber(prod.commission_percent)} %</td>
                  <td className="py-4 px-6 font-bold text-[#132333]">{formatCzk(customerPrice(prod))} Kč</td>
                  <td className="py-4 px-6 text-right whitespace-nowrap space-x-1">
                    <a
                      href={`#/produkt/${prod.slug || prod.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Náhled na e-shopu"
                      className="inline-flex p-2 text-gray-400 hover:text-[#132333] transition-colors rounded-lg hover:bg-gray-100"
                    >
                      <ExternalLink size={18} />
                    </a>
                    {prod.price_mode && prod.price_mode !== 'fixed' && (
                      <button
                        type="button"
                        onClick={() => setPriceMatrixProduct(prod)}
                        title="Upravit ceník"
                        className="p-2 text-gray-400 hover:text-blue-500 transition-colors rounded-lg hover:bg-blue-50"
                      >
                        <Table size={18} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenModal(prod)}
                      className="p-2 text-gray-400 hover:text-[#CCAD8A] transition-colors rounded-lg hover:bg-[#CCAD8A]/10"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(prod.id)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {priceMatrixProduct && (
        <AdminPriceMatrixModal
          productId={priceMatrixProduct.id}
          productTitle={priceMatrixProduct.title}
          priceMode={priceMatrixProduct.price_mode || null}
          onClose={() => setPriceMatrixProduct(null)}
        />
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-[#132333]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 p-6 flex justify-between items-center z-10">
              <h2 className="text-xl font-bold text-[#132333]">
                {editingId ? 'Upravit produkt' : 'Nový produkt'}
              </h2>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-[#132333] transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Název produktu</label>
                  <input
                    required
                    type="text"
                    value={formData.title || ''}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Kategorie</label>
                  <select
                    required
                    value={formData.category || ''}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                  >
                    <option value="" disabled>-- Vyberte kategorii --</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Cena ze ceníku / základ (Kč)</label>
                  <input
                    required
                    type="number"
                    step="1"
                    value={formData.price}
                    onChange={(e) => {
                      const newPrice = Number(e.target.value);
                      setFormData(p => {
                        const baseWithMarkup = newPrice * (1 + (p.supplier_markup_percent || 0) / 100);
                        const oldP = p.oldPrice || 0;
                        const vDiscountObj = p.extras?.find(ex => ex.key === 'visibleDiscount');
                        const vDiscount = vDiscountObj ? Number(vDiscountObj.value) : 0;
                        const targetSalePrice = oldP > 0 ? (oldP - vDiscount) : baseWithMarkup;
                        const newComm = baseWithMarkup > 0 ? ((targetSalePrice / baseWithMarkup) - 1) * 100 : p.commission_percent;
                        return { ...p, price: newPrice, commission_percent: Math.round(newComm * 100) / 100 };
                      });
                    }}
                    className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Navýšení dodavatele (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.supplier_markup_percent ?? 0}
                    onChange={(e) => {
                      const newMarkup = Number(e.target.value);
                      setFormData(p => {
                        const baseWithMarkup = (p.price || 0) * (1 + newMarkup / 100);
                        const oldP = p.oldPrice || 0;
                        const vDiscountObj = p.extras?.find(ex => ex.key === 'visibleDiscount');
                        const vDiscount = vDiscountObj ? Number(vDiscountObj.value) : 0;
                        const targetSalePrice = oldP > 0 ? (oldP - vDiscount) : baseWithMarkup;
                        const newComm = baseWithMarkup > 0 ? ((targetSalePrice / baseWithMarkup) - 1) * 100 : p.commission_percent;
                        return { ...p, supplier_markup_percent: newMarkup, commission_percent: Math.round(newComm * 100) / 100 };
                      });
                    }}
                    className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Původní cena (přeškrtnutá, Kč)</label>
                  <input
                    type="number"
                    step="1"
                    value={formData.oldPrice ?? ''}
                    onChange={(e) => {
                      const newOldPrice = e.target.value === '' ? undefined : Number(e.target.value);
                      setFormData(p => {
                        const baseWithMarkup = (p.price || 0) * (1 + (p.supplier_markup_percent || 0) / 100);
                        const salePrice = baseWithMarkup * (1 + (p.commission_percent || 0) / 100);
                        const newDiscount = newOldPrice ? newOldPrice - salePrice : 0;
                        
                        const newExtras = [...(p.extras || [])];
                        const dIdx = newExtras.findIndex(ex => ex.key === 'visibleDiscount');
                        if (dIdx > -1) newExtras[dIdx].value = Math.round(newDiscount).toString();
                        else newExtras.push({ key: 'visibleDiscount', value: Math.round(newDiscount).toString() });
                        
                        return { ...p, oldPrice: newOldPrice, extras: newExtras };
                      });
                    }}
                    className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Viditelná sleva (Kč)</label>
                  <input
                    type="number"
                    step="1"
                    value={formData.extras?.find(e => e.key === 'visibleDiscount')?.value || 0}
                    onChange={(e) => {
                      const newDiscount = Number(e.target.value);
                      setFormData(p => {
                        const newExtras = [...(p.extras || [])];
                        const dIdx = newExtras.findIndex(ex => ex.key === 'visibleDiscount');
                        if (dIdx > -1) newExtras[dIdx].value = newDiscount.toString();
                        else newExtras.push({ key: 'visibleDiscount', value: newDiscount.toString() });
                        
                        const oldP = p.oldPrice || 0;
                        const targetSalePrice = oldP > 0 ? (oldP - newDiscount) : 0;
                        const baseWithMarkup = (p.price || 0) * (1 + (p.supplier_markup_percent || 0) / 100);
                        
                        let newComm = p.commission_percent;
                        if (baseWithMarkup > 0 && oldP > 0) {
                           newComm = ((targetSalePrice / baseWithMarkup) - 1) * 100;
                        }
                        
                        return { ...p, extras: newExtras, commission_percent: Math.round(newComm * 100) / 100 };
                      });
                    }}
                    className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Provize (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.commission_percent ?? 0}
                    onChange={(e) => {
                      const newComm = Number(e.target.value);
                      setFormData(p => {
                        const baseWithMarkup = (p.price || 0) * (1 + (p.supplier_markup_percent || 0) / 100);
                        const salePrice = baseWithMarkup * (1 + newComm / 100);
                        const oldP = p.oldPrice || 0;
                        
                        const newExtras = [...(p.extras || [])];
                        if (oldP > 0) {
                          const newDiscount = oldP - salePrice;
                          const dIdx = newExtras.findIndex(ex => ex.key === 'visibleDiscount');
                          if (dIdx > -1) newExtras[dIdx].value = Math.round(newDiscount).toString();
                          else newExtras.push({ key: 'visibleDiscount', value: Math.round(newDiscount).toString() });
                        }
                        return { ...p, commission_percent: newComm, extras: newExtras };
                      });
                    }}
                    className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                  />
                </div>
                
                {/* Live Preview */}
                <div className="md:col-span-2 bg-[#132333]/5 border border-[#132333]/10 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-[#132333]">Živý náhled prodejní ceny (Kč vč. DPH)</h3>
                    <p className="text-xs text-gray-500 mt-1">Zobrazená cena zákazníkovi pro vámi zadaný základ.</p>
                  </div>
                  <div className="text-right">
                    {formData.oldPrice ? (
                      <div className="text-sm text-gray-400 line-through mb-1">
                        {formatCzk(Math.round(formData.oldPrice))} Kč
                      </div>
                    ) : null}
                    <div className="text-3xl font-black text-[#CCAD8A]">
                      {formatCzk(Math.round((formData.price || 0) * (1 + (formData.supplier_markup_percent || 0)/100) * (1 + (formData.commission_percent || 0)/100)))} Kč
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Štítek (např. Akce, Bestseller)</label>
                  <input
                    type="text"
                    value={formData.badge || ''}
                    onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Obrázek (URL nebo nahrát)</label>
                  <div className="flex gap-2">
                    <input
                      required
                      type="text"
                      value={formData.img || ''}
                      onChange={(e) => setFormData({ ...formData, img: e.target.value })}
                      placeholder="https://..."
                      className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"
                    />
                    <label className="cursor-pointer bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center font-medium shadow-sm whitespace-nowrap">
                      Nahrát
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const url = await uploadImage(file);
                            setFormData(prev => ({ ...prev, img: url }));
                          } catch (err) {
                            console.error(err);
                            toast.error("Chyba při nahrávání obrázku.");
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Galerie obrázků</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {formData.gallery?.map((gUrl, idx) => (
                      <div key={idx} className="relative group w-24 h-24 border border-gray-200 rounded shrink-0 overflow-hidden">
                        <img src={gUrl} alt="gallery" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setFormData(p => ({ ...p, gallery: p.gallery?.filter((_, i) => i !== idx) }))}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <label className="w-24 h-24 flex flex-col items-center justify-center cursor-pointer bg-gray-50 border-2 border-dashed border-gray-300 rounded hover:bg-gray-100 transition-colors">
                      <Plus className="text-gray-400 mb-1" size={20} />
                      <span className="text-[10px] text-gray-500 font-medium">Přidat fotku</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          if (!files.length) return;
                          try {
                            const promises = files.map(f => uploadImage(f));
                            const urls = await Promise.all(promises);
                            setFormData(prev => ({ ...prev, gallery: [...(prev.gallery || []), ...urls] }));
                          } catch (err) {
                            console.error(err);
                            toast.error("Chyba při nahrávání obrázků.");
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>

                <div className="md:col-span-2 border-b border-gray-100 pb-4 mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Režim konfigurace barev/látek</label>
                   <div className="flex flex-col sm:flex-row gap-4">
                     <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer bg-gray-50 px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-100 w-full">
                       <input 
                         type="radio" 
                         name="colorMode" 
                         checked={!formData.fabric_groups_config || formData.fabric_groups_config.length === 0}
                         onChange={() => {
                            if (formData.fabric_groups_config && formData.fabric_groups_config.length > 0) {
                              if (window.confirm("Opravdu chcete přepnout na jednoduchý vzorník? Stávající rozdělení do skupin bude smazáno.")) {
                                setFormData(p => ({ ...p, fabric_groups_config: [] }));
                              }
                            }
                         }}
                         className="text-[#CCAD8A] focus:ring-[#CCAD8A]"
                       />
                       <div>
                         <div className="font-semibold">Jednoduchý vzorník</div>
                         <div className="text-xs text-gray-500">Všechny barvy za jednu cenu přímo v konfigurátoru</div>
                       </div>
                     </label>
                     <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer bg-gray-50 px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-100 w-full">
                       <input 
                         type="radio" 
                         name="colorMode" 
                         checked={!!(formData.fabric_groups_config && formData.fabric_groups_config.length > 0)}
                         onChange={() => {
                            if (!formData.fabric_groups_config || formData.fabric_groups_config.length === 0) {
                              if (formData.colors && formData.colors.length > 0) {
                                if (!window.confirm("Opravdu chcete přepnout na skupiny látek? Stávající jednoduchý vzorník bude nahrazen.")) {
                                   return;
                                }
                              }
                              setFormData(p => ({ 
                                ...p, 
                                colors: [], 
                                fabric_groups_config: [{ name: 'Skupina látek 1', surcharge: 0, colors: [] }] 
                              }));
                            }
                         }}
                         className="text-[#CCAD8A] focus:ring-[#CCAD8A]"
                       />
                       <div>
                         <div className="font-semibold">Skupiny látek (příplatky)</div>
                         <div className="text-xs text-gray-500">Rozděleno do více skupin, možnost přidat % příplatek</div>
                       </div>
                     </label>
                   </div>
                </div>

                <div className="md:col-span-2 border-b border-gray-100 pb-4 mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Vlastní název pro sekci barev/látek (zobrazí se zákazníkům)</label>
                  <input
                    type="text"
                    value={formData.extras?.find(e => e.key === 'colorSectionTitle')?.value || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const newExtras = [...(formData.extras || [])];
                      const idx = newExtras.findIndex(ex => ex.key === 'colorSectionTitle');
                      if (idx > -1) {
                        if (val) newExtras[idx].value = val;
                        else newExtras.splice(idx, 1);
                      } else if (val) {
                        newExtras.push({ key: 'colorSectionTitle', value: val });
                      }
                      setFormData(p => ({ ...p, extras: newExtras }));
                    }}
                    placeholder={(!formData.fabric_groups_config || formData.fabric_groups_config.length === 0) ? 'Vyberte barvu profilu/látky' : 'Vyberte látku'}
                    className="w-full sm:w-1/2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-[#CCAD8A] focus:border-[#CCAD8A]"
                  />
                  <p className="text-xs text-gray-400 mt-1">Pokud nevyplníte, použije se výchozí název.</p>
                </div>

                {(!formData.fabric_groups_config || formData.fabric_groups_config.length === 0) ? (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Možnosti barev / dekorů (volitelně i s obrázkem)</label>
                    <p className="text-xs text-gray-500 mb-3">
                      Pokud neurčíte žádné barvy a produkt nepoužívá vlastní konfigurátor, nebudou se barvy nabízet. Zákazník uvidí barvy jako obdélníky s fotkou (pokud je nahraná) nebo jako textové tlačítko.
                    </p>
                    
                    <div className="flex flex-wrap gap-2 mb-4">
                      {formData.colors?.map((colorObj, idx) => {
                        const cName = typeof colorObj === 'string' ? colorObj : colorObj.name;
                        const cImg = typeof colorObj === 'string' ? undefined : colorObj.img;
                        return (
                          <div key={idx} className="flex items-center gap-3 bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg text-sm group">
                            {cImg ? (
                              <label className="cursor-pointer group/img relative">
                                <img src={cImg} alt={cName} className="w-10 h-10 object-cover rounded shadow-sm" />
                                <div className="absolute inset-0 bg-black/40 hidden group-hover/img:flex items-center justify-center rounded">
                                  <Upload size={12} className="text-white" />
                                </div>
                                <input 
                                  type="file" 
                                  className="hidden" 
                                  accept="image/*" 
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      try {
                                        const newUrl = await uploadImage(file);
                                        const newColors = [...(formData.colors || [])];
                                        const current = newColors[idx];
                                        if (typeof current === 'string') {
                                          newColors[idx] = { name: current, img: newUrl } as any;
                                        } else {
                                          newColors[idx] = { ...(current as any), img: newUrl } as any;
                                        }
                                        setFormData(p => ({ ...p, colors: newColors }));
                                      } catch (err) {
                                        alert("Chyba při nahrávání.");
                                      }
                                    }
                                  }} 
                                />
                              </label>
                            ) : (
                              <label className="cursor-pointer bg-gray-200 w-10 h-10 rounded shadow-sm flex items-center justify-center hover:bg-gray-300 transition-colors">
                                <Upload size={14} className="text-gray-500" />
                                <input 
                                  type="file" 
                                  className="hidden" 
                                  accept="image/*" 
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      try {
                                        const newUrl = await uploadImage(file);
                                        const newColors = [...(formData.colors || [])];
                                        const current = newColors[idx];
                                        if (typeof current === 'string') {
                                          newColors[idx] = { name: current, img: newUrl } as any;
                                        } else {
                                          newColors[idx] = { ...(current as any), img: newUrl } as any;
                                        }
                                        setFormData(p => ({ ...p, colors: newColors }));
                                      } catch (err) {
                                        alert("Chyba při nahrávání.");
                                      }
                                    }
                                  }} 
                                />
                              </label>
                            )}
                            <input 
                              type="text"
                              value={cName}
                              onChange={(e) => {
                                const newColors = [...(formData.colors || [])];
                                const current = newColors[idx];
                                if (typeof current === 'string') {
                                  newColors[idx] = e.target.value as any;
                                } else {
                                  newColors[idx] = { ...(current as any), name: e.target.value } as any;
                                }
                                setFormData(p => ({ ...p, colors: newColors }));
                              }}
                              className="font-semibold text-gray-800 bg-transparent border-b border-transparent focus:border-gray-300 focus:outline-none flex-1"
                            />
                            <button
                              type="button"
                              onClick={() => setFormData(p => ({ ...p, colors: p.colors?.filter((_, i) => i !== idx) }))}
                              className="text-red-500 hover:text-red-700 p-1.5 rounded-md hover:bg-red-50 transition-colors"
                              title="Odstranit"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    
                    <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-xl border border-gray-200">
                      <input
                        type="text"
                        id="newColorInput"
                        placeholder="Název (např. Dub zlatý)"
                        className="flex-[2] px-4 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CCAD8A] outline-none"
                      />
                      <label className="cursor-pointer bg-white border border-gray-300 text-gray-700 font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center shadow-sm">
                        <span className="text-sm">Vybrat foto</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          id="newColorFileInput"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const label = e.target.closest('label');
                              if (label) {
                                const span = label.querySelector('span');
                                if (span) span.textContent = 'Foto vybráno';
                              }
                            }
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={async () => {
                          const nameInput = document.getElementById('newColorInput') as HTMLInputElement;
                          const fileInput = document.getElementById('newColorFileInput') as HTMLInputElement;
                          const nameVal = nameInput.value.trim();
                          if (!nameVal) return toast.error('Zadejte název barvy nebo dekoru.');
                          
                          let fileUrl = undefined;
                          const file = fileInput.files?.[0];
                          if (file) {
                            try {
                              const btn = document.activeElement as HTMLButtonElement;
                              const prevTxt = btn.textContent;
                              btn.textContent = 'Nahrávám...';
                              btn.disabled = true;
                              fileUrl = await uploadImage(file);
                              btn.textContent = prevTxt;
                              btn.disabled = false;
                            } catch (err) {
                              console.error(err);
                              toast.error("Chyba při nahrávání obrázku barvy.");
                              return;
                            }
                          }
                          
                          setFormData(p => ({
                            ...p,
                            colors: [...(p.colors || []), { name: nameVal, img: fileUrl }] as any
                          }));
                          
                          // clear inputs
                          nameInput.value = '';
                          fileInput.value = '';
                          const label = fileInput.closest('label');
                          if (label) {
                            const span = label.querySelector('span');
                            if (span) span.textContent = 'Vybrat foto';
                          }
                        }}
                        className="px-5 py-2 bg-[#132333] text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
                      >
                        Přidat do vzorníku
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Editor Skupin Látek (s příplatkem a vlastním vzorníkem)</label>
                    <p className="text-xs text-gray-500 mb-3">Pokud má produkt více skupin látek (např. +10%, +20%), definujte je zde.</p>
                    <div className="space-y-4">
                      {formData.fabric_groups_config?.map((group, grpIdx) => (
                        <div key={grpIdx} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm relative">
                        <button
                          type="button"
                          onClick={() => setFormData(p => ({
                            ...p,
                            fabric_groups_config: p.fabric_groups_config?.filter((_, i) => i !== grpIdx)
                          }))}
                          className="absolute top-4 right-4 text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 size={16} />
                        </button>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Název skupiny</label>
                            <input
                              type="text"
                              value={group.name}
                              onChange={(e) => {
                                const newConfig = [...(formData.fabric_groups_config || [])];
                                newConfig[grpIdx].name = e.target.value;
                                setFormData(p => ({ ...p, fabric_groups_config: newConfig }));
                              }}
                              className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg focus:ring-[#CCAD8A]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Příplatek (Kč)</label>
                            <input
                              type="number"
                              value={group.surcharge ?? group.surcharge_percent ?? 0}
                              onChange={(e) => {
                                const newConfig = [...(formData.fabric_groups_config || [])];
                                newConfig[grpIdx].surcharge = Number(e.target.value);
                                newConfig[grpIdx].surcharge_percent = undefined; // clear legacy
                                setFormData(p => ({ ...p, fabric_groups_config: newConfig }));
                              }}
                              className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg focus:ring-[#CCAD8A]"
                            />
                          </div>
                        </div>

                        {/* Colors in this group */}
                        <div className="mb-2">
                          <label className="block text-xs font-semibold text-gray-700 mb-2">Vzorník pro tuto skupinu</label>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {group.colors.map((c, cIdx) => (
                              <div key={cIdx} className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-2 py-1 rounded-md text-xs">
                                {c.img ? (
                                  <label className="cursor-pointer group/img relative">
                                    <img src={c.img} alt={c.name} className="w-6 h-6 object-cover rounded" />
                                    <div className="absolute inset-0 bg-black/40 hidden group-hover/img:flex items-center justify-center rounded">
                                      <Upload size={10} className="text-white" />
                                    </div>
                                    <input 
                                      type="file" 
                                      className="hidden" 
                                      accept="image/*" 
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          try {
                                            const newUrl = await uploadImage(file);
                                            const newConfig = [...(formData.fabric_groups_config || [])];
                                            newConfig[grpIdx].colors[cIdx].img = newUrl;
                                            setFormData(p => ({ ...p, fabric_groups_config: newConfig }));
                                          } catch (err) {
                                            alert("Chyba při nahrávání.");
                                          }
                                        }
                                      }} 
                                    />
                                  </label>
                                ) : (
                                  <label className="cursor-pointer bg-gray-200 w-6 h-6 rounded flex items-center justify-center hover:bg-gray-300 transition-colors">
                                    <Upload size={10} className="text-gray-500" />
                                    <input 
                                      type="file" 
                                      className="hidden" 
                                      accept="image/*" 
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          try {
                                            const newUrl = await uploadImage(file);
                                            const newConfig = [...(formData.fabric_groups_config || [])];
                                            newConfig[grpIdx].colors[cIdx].img = newUrl;
                                            setFormData(p => ({ ...p, fabric_groups_config: newConfig }));
                                          } catch (err) {
                                            alert("Chyba při nahrávání.");
                                          }
                                        }
                                      }} 
                                    />
                                  </label>
                                )}
                                <input
                                  type="text"
                                  value={c.name}
                                  onChange={(e) => {
                                    const newConfig = [...(formData.fabric_groups_config || [])];
                                    newConfig[grpIdx].colors[cIdx].name = e.target.value;
                                    setFormData(p => ({ ...p, fabric_groups_config: newConfig }));
                                  }}
                                  className="font-medium text-gray-800 bg-transparent border-b border-transparent focus:border-gray-300 focus:outline-none w-24"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newConfig = [...(formData.fabric_groups_config || [])];
                                    newConfig[grpIdx].colors = newConfig[grpIdx].colors.filter((_, i) => i !== cIdx);
                                    setFormData(p => ({ ...p, fabric_groups_config: newConfig }));
                                  }}
                                  className="text-red-500 hover:text-red-700 p-1"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200">
                            <input
                              type="text"
                              placeholder="Název barvy/dekoru"
                              id={`newColorName_grp_${grpIdx}`}
                              className="flex-[2] px-3 py-1.5 text-xs text-gray-900 border border-gray-200 rounded-md focus:ring-1 focus:ring-[#CCAD8A]"
                            />
                            <label className="cursor-pointer bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors flex items-center justify-center">
                              <span className="text-xs">Foto</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                id={`newColorFile_grp_${grpIdx}`}
                                onChange={(e) => {
                                  if (e.target.files?.[0]) {
                                    const span = e.target.closest('label')?.querySelector('span');
                                    if (span) span.textContent = 'OK';
                                  }
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={async (e) => {
                                const nameInput = document.getElementById(`newColorName_grp_${grpIdx}`) as HTMLInputElement;
                                const fileInput = document.getElementById(`newColorFile_grp_${grpIdx}`) as HTMLInputElement;
                                const nameVal = nameInput.value.trim();
                                if (!nameVal) return toast.error('Zadejte název.');
                                
                                let fileUrl = undefined;
                                const file = fileInput.files?.[0];
                                if (file) {
                                  try {
                                    const btn = e.currentTarget;
                                    const pt = btn.textContent;
                                    btn.textContent = '...';
                                    btn.disabled = true;
                                    fileUrl = await uploadImage(file);
                                    btn.textContent = pt;
                                    btn.disabled = false;
                                  } catch (err) {
                                    toast.error('Chyba nahrávání');
                                    return;
                                  }
                                }
                                
                                const newConfig = [...(formData.fabric_groups_config || [])];
                                newConfig[grpIdx].colors.push({ name: nameVal, img: fileUrl });
                                setFormData(p => ({ ...p, fabric_groups_config: newConfig }));
                                
                                nameInput.value = '';
                                fileInput.value = '';
                                const span = fileInput.closest('label')?.querySelector('span');
                                if (span) span.textContent = 'Foto';
                              }}
                              className="px-3 py-1.5 bg-[#132333] text-white text-xs font-semibold rounded-md hover:bg-gray-800"
                            >
                              Přidat
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData(p => ({
                      ...p,
                      fabric_groups_config: [...(p.fabric_groups_config || []), { name: 'Nová skupina', surcharge: 0, colors: [] }]
                    }))}
                    className="mt-3 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg border border-gray-200 hover:bg-gray-200 inline-flex items-center gap-2"
                  >
                    <Plus size={16} /> Prázdná skupina látek
                  </button>
                </div>
              )}

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Popis produktu</label>
                <div className="border-t border-b sm:border border-gray-200 sm:rounded-lg overflow-hidden bg-white">
                  <RichTextEditor
                    value={formData.desc || ''}
                    onChange={(val) => setFormData({ ...formData, desc: val })}
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-3 cursor-pointer p-4 border border-gray-200 rounded-xl bg-gray-50 hover:bg-gray-100 transition">
                  <input
                    type="checkbox"
                    checked={formData.hidden || false}
                    onChange={(e) => setFormData({ ...formData, hidden: e.target.checked })}
                    className="w-5 h-5 text-[#CCAD8A] border-gray-300 rounded focus:ring-[#CCAD8A]"
                  />
                  <span className="font-semibold text-gray-700">Skrýt produkt na e-shopu (viditelný jen v administraci)</span>
                </label>
              </div>

              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/80">
                <p className="text-sm font-bold text-[#132333] mb-3">Limity rozměrů (volitelné, pro kalkulačku API)</p>
                <p className="text-xs text-gray-500 mb-4">
                  Všechny hodnoty níže jsou v <span className="font-semibold text-[#132333]">milimetrech (mm)</span>.
                  Vyplňte šířku/výšku min–max najednou, nebo sekci vyprázdněte. Max. plocha je volitelná — prázdné =
                  kontrola plochy v kalkulačce se nepoužije.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Šířka min (mm)</label>
                    <input
                      type="number"
                      value={formData.width_mm_min === '' || formData.width_mm_min == null ? '' : formData.width_mm_min}
                      onChange={(e) =>
                        setFormData({ ...formData, width_mm_min: e.target.value === '' ? '' : Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Šířka max (mm)</label>
                    <input
                      type="number"
                      value={formData.width_mm_max === '' || formData.width_mm_max == null ? '' : formData.width_mm_max}
                      onChange={(e) =>
                        setFormData({ ...formData, width_mm_max: e.target.value === '' ? '' : Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Výška min (mm)</label>
                    <input
                      type="number"
                      value={formData.height_mm_min === '' || formData.height_mm_min == null ? '' : formData.height_mm_min}
                      onChange={(e) =>
                        setFormData({ ...formData, height_mm_min: e.target.value === '' ? '' : Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Výška max (mm)</label>
                    <input
                      type="number"
                      value={formData.height_mm_max === '' || formData.height_mm_max == null ? '' : formData.height_mm_max}
                      onChange={(e) =>
                        setFormData({ ...formData, height_mm_max: e.target.value === '' ? '' : Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Max. plocha (m²) — volitelné</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.max_area_m2 === '' || formData.max_area_m2 == null ? '' : formData.max_area_m2}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          max_area_m2: e.target.value === '' ? '' : Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg"
                    />
                  </div>
                </div>
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      Režim ceny (price_mode)
                    </label>
                    <input
                      type="text"
                      value={formData.price_mode === '' || formData.price_mode == null ? '' : String(formData.price_mode)}
                      onChange={(e) =>
                        setFormData({ ...formData, price_mode: e.target.value })
                      }
                      placeholder="matrix_cell"
                      className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      Skupina látek (1–5)
                    </label>
                    <input
                      type="number"
                      value={
                        formData.fabric_group === '' || formData.fabric_group == null
                          ? ''
                          : formData.fabric_group
                      }
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          fabric_group: e.target.value === '' ? '' : Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      Validace (např. textile_zaluzie)
                    </label>
                    <input
                      type="text"
                      value={
                        formData.validation_profile === '' || formData.validation_profile == null
                          ? ''
                          : formData.validation_profile
                      }
                      onChange={(e) =>
                        setFormData({ ...formData, validation_profile: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Extras (Příplatkové věci) */}
              <div className="mt-8 border-t border-gray-100 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900">Příplatkové položky</h3>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      extras: [...(prev.extras || []), { id: Date.now().toString(), name: 'Nová položka', price: 0 }]
                    }))}
                    className="text-sm font-medium text-[#CCAD8A] hover:text-[#b89b7c] flex items-center gap-1"
                  >
                    + Přidat položku
                  </button>
                </div>
                <div className="space-y-3">
                  {formData.extras?.map(extra => (
                    <div key={extra.id} className="flex gap-3 items-center p-3 border border-gray-100 rounded-xl bg-gray-50/50">
                      <div className="flex-[2]">
                        <input
                          type="text"
                          placeholder="Název (např. Montáž)"
                          value={extra.name}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            extras: (prev.extras || []).map(ex => ex.id === extra.id ? { ...ex, name: e.target.value } : ex)
                          }))}
                          className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A]"
                        />
                      </div>
                      <div className="flex-1 max-w-[120px]">
                        <input
                          type="number"
                          placeholder="Cena (Kč)"
                          value={extra.price}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            extras: (prev.extras || []).map(ex => ex.id === extra.id ? { ...ex, price: Number(e.target.value) } : ex)
                          }))}
                          className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          extras: (prev.extras || []).filter(ex => ex.id !== extra.id)
                        }))}
                        className="p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"
                        title="Odebrat položku"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                  {(!formData.extras || formData.extras.length === 0) && (
                    <div className="text-sm text-gray-400 p-4 text-center bg-gray-50 rounded-xl border border-gray-100 border-dashed">
                      Žádné příplatkové položky nejsou nastaveny.
                    </div>
                  )}
                </div>
              </div>

              {/* Parametry (Volitelné možnosti výběru) */}
              <div className="mt-8 border-t border-gray-100 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Vlastní parametry (Výběry z možností)</h3>
                    <p className="text-sm text-gray-500">Přidejte vlastní konfigurátor (např. výběr barvy profilu, výběr typu ovládání atd.)</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      parameters: [...(prev.parameters || []), {
                        id: Date.now().toString(),
                        name: 'Nový parametr',
                        type: 'select',
                        options: [],
                      }]
                    }))}
                    className="text-sm font-medium text-[#CCAD8A] hover:text-[#b89b7c] flex items-center gap-1"
                  >
                    + Přidat parametr
                  </button>
                </div>
                
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndParams}>
                  <SortableContext items={(formData.parameters || []).map(p => p.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-6">
                      {formData.parameters?.map((param, pIdx) => (
                        <SortableParameterItem key={param.id} id={param.id} onRemove={() => setFormData(prev => ({
                          ...prev,
                          parameters: (prev.parameters || []).filter(p => p.id !== param.id)
                        }))}>
                          <div className="grid grid-cols-2 gap-4 mb-4 pr-10">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Název parametru (např. Barva profilu)</label>
                          <input
                            type="text"
                            value={param.name}
                            onChange={(e) => {
                              const newParams = structuredClone(formData.parameters || []);
                              newParams[pIdx].name = e.target.value;
                              setFormData(prev => ({ ...prev, parameters: newParams }));
                            }}
                            className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg focus:ring-[#CCAD8A]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Typ vstupu uživatele</label>
                          <select
                            value={param.type}
                            onChange={(e) => {
                              const newParams = structuredClone(formData.parameters || []);
                              newParams[pIdx].type = e.target.value as any;
                              setFormData(prev => ({ ...prev, parameters: newParams }));
                            }}
                            className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg focus:ring-[#CCAD8A]"
                          >
                            <option value="select">Klasický výběr ze seznamu</option>
                            <option value="color_array">Vzorník (Dlaždice s obrázky/barvou)</option>
                            <option value="numeric">Číselná hodnota (rozměr)</option>
                          </select>
                        </div>
                      </div>

                      {/* Condition settings */}
                      <div className="mt-4 border-t border-gray-100 pt-4">
                        <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer mb-2">
                          <input
                            type="checkbox"
                            checked={!!param.condition}
                            onChange={(e) => {
                              const newParams = structuredClone(formData.parameters || []);
                              if (e.target.checked) {
                                newParams[pIdx].condition = { dependsOnParamId: '', allowedValues: [] };
                              } else {
                                delete newParams[pIdx].condition;
                              }
                              setFormData(prev => ({ ...prev, parameters: newParams }));
                            }}
                            className="rounded border-gray-300 text-[#CCAD8A] focus:ring-[#CCAD8A]"
                          />
                          Zobrazit tento parametr POUZE při splnění podmínky
                        </label>
                        
                        {param.condition && (
                          <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-200 mt-2">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Závisí na parametru:</label>
                              <select
                                value={param.condition.dependsOnParamId}
                                onChange={(e) => {
                                  const newParams = structuredClone(formData.parameters || []);
                                  newParams[pIdx].condition!.dependsOnParamId = e.target.value;
                                  newParams[pIdx].condition!.allowedValues = [];
                                  setFormData(prev => ({ ...prev, parameters: newParams }));
                                }}
                                className="w-full px-2 py-1.5 text-xs text-gray-900 border border-gray-200 rounded focus:ring-[#CCAD8A]"
                              >
                                <option value="">-- Vyberte parametr --</option>
                                {formData.parameters?.filter(p => p.id !== param.id).map(p => (
                                  <option key={p.id} value={p.id}>{p.name || 'Nepojmenovaný parametr'}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Při vybraných hodnotách:</label>
                              {(() => {
                                const parentParam = formData.parameters?.find(p => p.id === param.condition?.dependsOnParamId);
                                if (!parentParam) return <p className="text-xs text-gray-400 italic">Nejprve vyberte nadřazený parametr.</p>;
                                return (
                                  <div className="flex flex-wrap gap-2">
                                    {parentParam.options.map(opt => (
                                      <label key={opt.value} className="flex items-center gap-1 text-[11px] bg-white border border-gray-200 px-2 py-1 rounded cursor-pointer hover:bg-gray-50">
                                        <input
                                          type="checkbox"
                                          checked={param.condition!.allowedValues.includes(opt.value)}
                                          onChange={(e) => {
                                            const newParams = structuredClone(formData.parameters || []);
                                            const currentValues = new Set(newParams[pIdx].condition!.allowedValues);
                                            if (e.target.checked) currentValues.add(opt.value);
                                            else currentValues.delete(opt.value);
                                            newParams[pIdx].condition!.allowedValues = Array.from(currentValues);
                                            setFormData(prev => ({ ...prev, parameters: newParams }));
                                          }}
                                          className="w-3 h-3 rounded-sm border-gray-300 text-[#CCAD8A] focus:ring-[#CCAD8A]"
                                        />
                                        {opt.label || 'Nová možnost'}
                                      </label>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Numeric Settings */}
                      {param.type === 'numeric' && (
                        <div className="mt-4 border-t border-gray-100 pt-4 grid grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Min. hodnota</label>
                            <input
                              type="number"
                              value={param.numericSettings?.min ?? ''}
                              onChange={(e) => {
                                const newParams = structuredClone(formData.parameters || []);
                                newParams[pIdx].numericSettings = { ...newParams[pIdx].numericSettings, min: e.target.value ? Number(e.target.value) : undefined };
                                setFormData(prev => ({ ...prev, parameters: newParams }));
                              }}
                              className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg focus:ring-[#CCAD8A]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Max. hodnota</label>
                            <input
                              type="number"
                              value={param.numericSettings?.max ?? ''}
                              onChange={(e) => {
                                const newParams = structuredClone(formData.parameters || []);
                                newParams[pIdx].numericSettings = { ...newParams[pIdx].numericSettings, max: e.target.value ? Number(e.target.value) : undefined };
                                setFormData(prev => ({ ...prev, parameters: newParams }));
                              }}
                              className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg focus:ring-[#CCAD8A]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Výchozí hodnota</label>
                            <input
                              type="number"
                              value={param.numericSettings?.defaultValue ?? ''}
                              onChange={(e) => {
                                const newParams = structuredClone(formData.parameters || []);
                                newParams[pIdx].numericSettings = { ...newParams[pIdx].numericSettings, defaultValue: e.target.value ? Number(e.target.value) : undefined };
                                setFormData(prev => ({ ...prev, parameters: newParams }));
                              }}
                              className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg focus:ring-[#CCAD8A]"
                            />
                          </div>
                        </div>
                      )}

                      {/* Options for this parameter (only if not numeric) */}
                      {param.type !== 'numeric' && (
                      <div className="mt-4 border-t border-gray-100 pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-xs font-semibold text-gray-700">Možnosti výběru</label>
                          <button
                            type="button"
                            onClick={() => {
                              const newParams = structuredClone(formData.parameters || []);
                              newParams[pIdx].options.push({
                                label: 'Nová možnost',
                                value: Date.now().toString(),
                                priceVariant: 0,
                              });
                              setFormData(prev => ({ ...prev, parameters: newParams }));
                            }}
                            className="text-xs font-medium text-[#132333] hover:text-[#213b5e] flex items-center gap-1"
                          >
                            <Plus size={14} /> Přidat možnost
                          </button>
                        </div>
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEndOptions(pIdx, e)}>
                          <SortableContext items={param.options.map(o => o.value)} strategy={verticalListSortingStrategy}>
                            <div className="space-y-2">
                              {param.options.map((opt, oIdx) => (
                                <SortableOptionItem key={opt.value} id={opt.value}>
                                  <div className="flex-1">
                                    <input
                                      type="text"
                                      placeholder="Název (např. Bílá)"
                                      value={opt.label}
                                      onChange={(e) => {
                                        const newParams = structuredClone(formData.parameters || []);
                                        newParams[pIdx].options[oIdx].label = e.target.value;
                                        setFormData(prev => ({ ...prev, parameters: newParams }));
                                      }}
                                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-[#CCAD8A]"
                                    />
                                  </div>
                                  {param.type === 'color_array' && (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="color"
                                        value={opt.colorCode || '#ffffff'}
                                        onChange={(e) => {
                                          const newParams = structuredClone(formData.parameters || []);
                                          newParams[pIdx].options[oIdx].colorCode = e.target.value;
                                          setFormData(prev => ({ ...prev, parameters: newParams }));
                                        }}
                                        className="w-8 h-8 rounded shrink-0 border border-gray-200 p-0.5 object-cover cursor-pointer"
                                        title="Zvolit barvu (HEX)"
                                      />
                                      <label className="text-xs text-center border border-gray-200 bg-white rounded px-2 py-1.5 cursor-pointer hover:bg-gray-100 flex items-center justify-center min-w-[50px]">
                                        {opt.img ? 'Změnit foto' : 'Nahrát foto'}
                                        <input
                                          type="file"
                                          className="hidden"
                                          accept="image/*"
                                          onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                              try {
                                                const url = await uploadImage(file);
                                                const newParams = structuredClone(formData.parameters || []);
                                                newParams[pIdx].options[oIdx].img = url;
                                                setFormData(prev => ({ ...prev, parameters: newParams }));
                                              } catch (err) {
                                                toast.error('Chyba při nahrávání');
                                              }
                                            }
                                          }}
                                        />
                                      </label>
                                      {opt.img && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newParams = structuredClone(formData.parameters || []);
                                            newParams[pIdx].options[oIdx].img = undefined;
                                            setFormData(prev => ({ ...prev, parameters: newParams }));
                                          }}
                                          className="text-red-500 hover:bg-red-50 p-1 rounded"
                                          title="Odstranit foto"
                                        >
                                          <X size={14} />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  <div className="w-24">
                                    <div className="relative">
                                      <input
                                        type="number"
                                        placeholder="Příplatek"
                                        value={opt.priceVariant || 0}
                                        onChange={(e) => {
                                          const newParams = structuredClone(formData.parameters || []);
                                          newParams[pIdx].options[oIdx].priceVariant = Number(e.target.value);
                                          setFormData(prev => ({ ...prev, parameters: newParams }));
                                        }}
                                        className="w-full px-2 py-1.5 pl-2 pr-6 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-[#CCAD8A]"
                                      />
                                      <span className="absolute right-2 top-1.5 text-xs text-gray-500">Kč</span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newParams = structuredClone(formData.parameters || []);
                                      newParams[pIdx].options = newParams[pIdx].options.filter((_, i) => i !== oIdx);
                                      setFormData(prev => ({ ...prev, parameters: newParams }));
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </SortableOptionItem>
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                        {param.options.length === 0 && (
                          <p className="text-xs text-gray-400 italic mt-2">Zatím nejsou přidány žádné možnosti.</p>
                        )}
                      </div>
                      )}
                    </SortableParameterItem>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {(!formData.parameters || formData.parameters.length === 0) && (
              <div className="text-sm text-gray-400 p-4 text-center bg-gray-50 rounded-xl border border-gray-100 border-dashed mt-6">
                Zatím nejsou nastaveny žádné vlastní parametry.
              </div>
            )}
          </div>

          <p className="text-sm text-gray-500">
                Zobrazená cena zákazníkovi: základ × (1 + navýšení/100) × (1 + provize/100), zaokrouhleno na celé Kč.
                Výsledné částky jsou zobrazeny vč. DPH (konečná cena jako v matrixu, v závislosti na vašem ceníku).
              </p>

              <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-6 py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl font-bold bg-[#132333] hover:bg-[#1a3047] text-white transition-colors"
                >
                  Uložit produkt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
