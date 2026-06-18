import { X, Eye, EyeOff, Trash2 } from 'lucide-react';

export default function AdminMassEditBar({
  selectedCount,
  onClear,
  onDelete,
  onHide,
  onShow,
}: {
  selectedCount: number;
  onClear: () => void;
  onDelete: () => void;
  onHide: () => void;
  onShow: () => void;
}) {
  if (selectedCount === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#132333] text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 z-50">
      <div className="flex items-center gap-2">
        <span className="font-bold">{selectedCount}</span> <span className="text-gray-400">vybráno</span>
        <button onClick={onClear} className="p-1 hover:bg-white/10 rounded-full transition ml-2">
          <X size={16} />
        </button>
      </div>
      <div className="h-6 w-px bg-white/20"></div>
      <div className="flex items-center gap-4">
        <button onClick={onHide} className="flex items-center gap-2 text-sm font-semibold hover:text-[#CCAD8A] transition">
          <EyeOff size={16} /> Skrýt
        </button>
        <button onClick={onShow} className="flex items-center gap-2 text-sm font-semibold hover:text-[#CCAD8A] transition">
          <Eye size={16} /> Zobrazit
        </button>
        <button onClick={onDelete} className="flex items-center gap-2 text-sm font-semibold text-red-400 hover:text-red-300 transition">
          <Trash2 size={16} /> Smazat
        </button>
      </div>
    </div>
  );
}
