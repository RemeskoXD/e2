import { useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2, Save, ExternalLink } from 'lucide-react';
import RichTextEditor from '../../components/RichTextEditor';
import type { MeasureGuideSectionDto } from '../../lib/measureGuide';

function SortableSectionCard({
  section,
  onSave,
  onDelete,
  draftTitle,
  draftBody,
  draftVideo,
  onDraftTitle,
  onDraftBody,
  onDraftVideo,
}: {
  section: MeasureGuideSectionDto;
  onSave: () => void;
  onDelete: () => void;
  draftTitle: string;
  draftBody: string;
  draftVideo: string;
  onDraftTitle: (v: string) => void;
  onDraftBody: (v: string) => void;
  onDraftVideo: (v: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
    >
      <div className="flex items-stretch gap-2 border-b border-gray-100 bg-gray-50/80">
        <button
          type="button"
          className="px-2 text-gray-400 hover:text-[#132333] cursor-grab active:cursor-grabbing touch-none"
          aria-label="Přesunout sekci"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={22} />
        </button>
        <input
          value={draftTitle}
          onChange={(e) => onDraftTitle(e.target.value)}
          className="flex-1 min-w-0 font-semibold text-[#132333] bg-transparent py-3 px-2 outline-none"
          placeholder="Nadpis záložky"
        />
      </div>
      <div className="p-4 space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Text (editor jako ve Wordu)</label>
          <RichTextEditor value={draftBody} onChange={onDraftBody} />
          <p className="text-xs text-gray-400 mt-1">
            Tučné, nadpisy, odrážky, odkazy. Vložení YouTube: tlačítko „YouTube“ v liště — nebo pole URL videa níže
            (zobrazí se i Vimeo).
          </p>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
            URL videa (YouTube / Vimeo) — zobrazí se pod textem na webu
          </label>
          <input
            value={draftVideo}
            onChange={(e) => onDraftVideo(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSave}
            className="inline-flex items-center gap-2 bg-[#132333] text-white font-bold px-4 py-2 rounded-lg text-sm hover:bg-[#1a3145]"
          >
            <Save size={16} />
            Uložit sekci
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-2 border border-red-200 text-red-700 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-red-50"
          >
            <Trash2 size={16} />
            Smazat
          </button>
          <a
            href="#/jak-zamerit"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-[#CCAD8A] font-semibold px-2 py-2"
          >
            Náhled webu <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </div>
  );
}

export default function AdminMeasureGuide() {
  const [sections, setSections] = useState<MeasureGuideSectionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [eyebrow, setEyebrow] = useState('');
  const [title, setTitle] = useState('');
  const [intro, setIntro] = useState('');
  const [cardTitle, setCardTitle] = useState('');
  const [cardSubtitle, setCardSubtitle] = useState('');

  const [drafts, setDrafts] = useState<
    Record<number, { title: string; body_html: string; video_url: string }>
  >({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const authHeaders = (): HeadersInit => {
    const token = localStorage.getItem('adminToken');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const load = async () => {
    setMsg(null);
    try {
      const res = await fetch('/api/measure-guide');
      const data = await res.json();
      if (!res.ok) {
        setMsg(typeof data?.error === 'string' ? data.error : 'Nelze načíst obsah.');
        return;
      }
      const p = data.page as {
        eyebrow: string;
        title: string;
        intro: string;
        card_title: string;
        card_subtitle: string;
      };
      const secs = (data.sections as MeasureGuideSectionDto[]) ?? [];
      setEyebrow(p.eyebrow ?? '');
      setTitle(p.title ?? '');
      setIntro(p.intro ?? '');
      setCardTitle(p.card_title ?? '');
      setCardSubtitle(p.card_subtitle ?? '');
      setSections(secs);
      const d: Record<number, { title: string; body_html: string; video_url: string }> = {};
      for (const s of secs) {
        d[s.id] = {
          title: s.title,
          body_html: s.body_html ?? '',
          video_url: s.video_url ?? '',
        };
      }
      setDrafts(d);
    } catch {
      setMsg('Nelze se spojit se serverem.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const persistOrder = async (ordered: MeasureGuideSectionDto[]) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    const res = await fetch('/api/admin/measure-guide/sections/reorder', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ orderedIds: ordered.map((s) => s.id) }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg(typeof j?.error === 'string' ? j.error : 'Pořadí se nepodařilo uložit.');
      void load();
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSections((items) => {
      const oldIndex = items.findIndex((s) => s.id === active.id);
      const newIndex = items.findIndex((s) => s.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return items;
      const next = arrayMove(items, oldIndex, newIndex);
      void persistOrder(next);
      return next;
    });
  };

  const savePage = async () => {
    setMsg(null);
    try {
      const res = await fetch('/api/admin/measure-guide/page', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          eyebrow,
          title,
          intro,
          card_title: cardTitle,
          card_subtitle: cardSubtitle,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(typeof data?.error === 'string' ? data.error : 'Uložení hlavičky selhalo.');
        return;
      }
      setMsg('Hlavička stránky uložena.');
    } catch {
      setMsg('Chyba při ukládání.');
    }
  };

  const saveSection = async (id: number) => {
    setMsg(null);
    const d = drafts[id];
    if (!d) return;
    try {
      const res = await fetch(`/api/admin/measure-guide/sections/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          title: d.title,
          body_html: d.body_html,
          video_url: d.video_url.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(typeof data?.error === 'string' ? data.error : 'Sekci se nepodařilo uložit.');
        return;
      }
      const row = data as MeasureGuideSectionDto;
      setSections((prev) => prev.map((s) => (s.id === id ? row : s)));
      setDrafts((prev) => ({
        ...prev,
        [id]: {
          title: row.title,
          body_html: row.body_html ?? '',
          video_url: row.video_url ?? '',
        },
      }));
      setMsg('Sekce uložena.');
    } catch {
      setMsg('Chyba při ukládání sekce.');
    }
  };

  const deleteSection = async (id: number) => {
    if (!confirm('Opravdu smazat tuto sekci?')) return;
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/measure-guide/sections/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        setMsg('Smazání se nepodařilo.');
        return;
      }
      setSections((prev) => prev.filter((s) => s.id !== id));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setMsg('Sekce smazána.');
    } catch {
      setMsg('Chyba při mazání.');
    }
  };

  const addSection = async () => {
    setMsg(null);
    try {
      const res = await fetch('/api/admin/measure-guide/sections', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          title: 'Nová sekce',
          body_html: '<p>Doplňte text.</p>',
          video_url: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(typeof data?.error === 'string' ? data.error : 'Sekci se nepodařilo přidat.');
        return;
      }
      const row = data as MeasureGuideSectionDto;
      setSections((prev) => [...prev, row]);
      setDrafts((prev) => ({
        ...prev,
        [row.id]: { title: row.title, body_html: row.body_html ?? '', video_url: row.video_url ?? '' },
      }));
      setMsg('Nová sekce přidána — upravte a uložte.');
    } catch {
      setMsg('Chyba při přidávání.');
    }
  };

  const setDraft = (id: number, patch: Partial<{ title: string; body_html: string; video_url: string }>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  if (loading) {
    return <div className="text-gray-500 font-medium">Načítám obsah…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      <div>
        <h1 className="text-3xl font-bold text-[#132333] mb-2">Jak zaměřit — obsah stránky</h1>
        <p className="text-gray-500 text-sm mb-6">
          Upravte nadpisy a sekce. Sekce přetahujte za ikonu ⋮⋮. Text editujte jako ve Wordu; video může být v
          textu (vložení z YouTube) nebo jako URL pod editorem.
        </p>
        {msg && (
          <p className="text-sm text-[#132333] bg-[#CCAD8A]/15 border border-[#CCAD8A]/40 rounded-lg px-4 py-2 mb-4">
            {msg}
          </p>
        )}
      </div>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h2 className="font-bold text-[#132333]">Hlavička stránky (breadcrumb oblast)</h2>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Malý nadpis (eyebrow)</label>
          <input
            value={eyebrow}
            onChange={(e) => setEyebrow(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Hlavní titulek</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Úvodní odstavec</label>
          <textarea
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Titulek v bílé kartě</label>
          <input
            value={cardTitle}
            onChange={(e) => setCardTitle(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Podnadpis v kartě</label>
          <textarea
            value={cardSubtitle}
            onChange={(e) => setCardSubtitle(e.target.value)}
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2"
          />
        </div>
        <button
          type="button"
          onClick={() => void savePage()}
          className="bg-[#132333] text-white font-bold px-5 py-2.5 rounded-xl text-sm"
        >
          Uložit hlavičku
        </button>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-[#132333]">Rozbalovací sekce</h2>
          <button
            type="button"
            onClick={() => void addSection()}
            className="inline-flex items-center gap-2 bg-[#CCAD8A] text-[#132333] font-bold px-4 py-2 rounded-xl text-sm"
          >
            <Plus size={18} />
            Přidat sekci
          </button>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {sections.map((sec) => {
                const d = drafts[sec.id] ?? {
                  title: sec.title,
                  body_html: sec.body_html ?? '',
                  video_url: sec.video_url ?? '',
                };
                return (
                  <SortableSectionCard
                    key={sec.id}
                    section={sec}
                    draftTitle={d.title}
                    draftBody={d.body_html}
                    draftVideo={d.video_url}
                    onDraftTitle={(v) => setDraft(sec.id, { title: v })}
                    onDraftBody={(v) => setDraft(sec.id, { body_html: v })}
                    onDraftVideo={(v) => setDraft(sec.id, { video_url: v })}
                    onSave={() => void saveSection(sec.id)}
                    onDelete={() => void deleteSection(sec.id)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </section>
    </div>
  );
}
