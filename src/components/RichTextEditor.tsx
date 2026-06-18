import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Youtube from '@tiptap/extension-youtube';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { uploadImage } from '../lib/imageHelpers';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Link as LinkIcon,
  Image as ImageIcon, Youtube as YoutubeIcon, List, ListOrdered, Quote,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Table as TableIcon,
  Heading2, Heading3, Type, Palette
} from 'lucide-react';

type Props = {
  value: string;
  onChange: (html: string) => void;
};

const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
  }),
  Underline,
  Link.configure({ openOnClick: false, autolink: true }),
  Placeholder.configure({ placeholder: 'Začněte psát obsah…' }),
  Youtube.configure({
    width: 640,
    height: 360,
    HTMLAttributes: { class: 'rounded-lg max-w-full w-full aspect-video my-4' },
  }),
  Image.configure({
    HTMLAttributes: { class: 'max-w-full h-auto rounded-lg shadow-sm inline-block my-4' },
  }),
  TextAlign.configure({
    types: ['heading', 'paragraph'],
  }),
  TextStyle,
  Color,
  Table.configure({
    resizable: true,
    HTMLAttributes: {
      class: 'border-collapse table-auto w-full border border-gray-300 my-4 shadow-sm rounded-lg overflow-hidden',
    },
  }),
  TableRow.configure({
    HTMLAttributes: {
      class: 'border-b border-gray-200 hover:bg-gray-50/50',
    },
  }),
  TableHeader.configure({
    HTMLAttributes: {
      class: 'bg-gray-100/80 border border-gray-300 px-4 py-2 font-bold text-left text-gray-700',
    },
  }),
  TableCell.configure({
    HTMLAttributes: {
      class: 'border border-gray-300 px-4 py-2 text-gray-600',
    },
  }),
];

const PRESET_COLORS = [
  '#000000', '#132333', '#334155', '#64748b', '#94a3b8',
  '#CCAD8A', '#ef4444', '#f97316', '#f59e0b', '#84cc16', 
  '#22c55e', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef'
];

export default function RichTextEditor({ value, onChange }: Props) {
  const [showColors, setShowColors] = useState(false);
  
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: value,
    editorProps: {
      attributes: {
        class:
          'tiptap max-w-none min-h-[300px] px-6 py-6 focus:outline-none text-gray-800 text-sm leading-relaxed [&_iframe]:max-w-full prose prose-sm sm:prose-base prose-gray',
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const cur = editor.getHTML();
    if (value !== cur) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) {
    return <div className="min-h-[300px] border border-gray-200 rounded-xl bg-gray-50 animate-pulse" />;
  }

  const addLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Adresa odkazu (URL):', prev ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const addYoutube = () => {
    const url = window.prompt('Odkaz na YouTube (např. https://www.youtube.com/watch?v=…):', 'https://');
    if (!url?.trim()) return;
    editor.chain().focus().setYoutubeVideo({ src: url.trim() }).run();
  };

  const addImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const url = await uploadImage(file);
        editor.chain().focus().setImage({ src: url }).run();
      } catch (err) {
        console.error(err);
        alert('Chyba při nahrávání obrázku.');
      }
    };
    input.click();
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const btn = (active: boolean) =>
    `p-1.5 rounded-lg transition-colors flex items-center justify-center ${
      active 
        ? 'bg-[#132333] text-white shadow-sm' 
        : 'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  const Divider = () => <div className="w-px h-6 bg-gray-200 mx-1" />;

  return (
    <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden bg-white flex flex-col focus-within:ring-2 focus-within:ring-[#CCAD8A] focus-within:border-[#CCAD8A] transition-all">
      {/* Primary Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 border-b border-gray-100 bg-gray-50/80">
        <button type="button" title="Tučně" className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={18} />
        </button>
        <button type="button" title="Kurzíva" className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={18} />
        </button>
        <button type="button" title="Podtržené" className={btn(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon size={18} />
        </button>
        <button type="button" title="Přeškrtnuté" className={btn(editor.isActive('strike'))} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough size={18} />
        </button>
        
        <Divider />
        
        <button type="button" title="Zarovnat vlevo" className={btn(editor.isActive({ textAlign: 'left' }))} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
          <AlignLeft size={18} />
        </button>
        <button type="button" title="Zarovnat na střed" className={btn(editor.isActive({ textAlign: 'center' }))} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
          <AlignCenter size={18} />
        </button>
        <button type="button" title="Zarovnat vpravo" className={btn(editor.isActive({ textAlign: 'right' }))} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
          <AlignRight size={18} />
        </button>
        <button type="button" title="Do bloku" className={btn(editor.isActive({ textAlign: 'justify' }))} onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
          <AlignJustify size={18} />
        </button>

        <Divider />

        <div className="relative">
          <button type="button" title="Barva textu" className={btn(showColors)} onClick={() => setShowColors(!showColors)}>
            <Palette size={18} />
            <div 
              className="w-3 h-3 rounded-full ml-1 border border-gray-200" 
              style={{ backgroundColor: editor.getAttributes('textStyle').color || '#000000' }}
            />
          </button>
          
          {showColors && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowColors(false)} />
              <div className="absolute top-full left-0 mt-1 p-2 bg-white border border-gray-200 rounded-lg shadow-xl z-20 w-48 grid grid-cols-4 gap-1">
                {PRESET_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    className="w-8 h-8 rounded-md border border-gray-200 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      editor.chain().focus().setColor(color).run();
                      setShowColors(false);
                    }}
                  />
                ))}
                <button 
                  type="button" 
                  className="col-span-4 mt-1 text-xs text-center py-1 bg-gray-50 hover:bg-gray-100 rounded border border-gray-200"
                  onClick={() => {
                    editor.chain().focus().unsetColor().run();
                    setShowColors(false);
                  }}
                >
                  Odstranit barvu
                </button>
              </div>
            </>
          )}
        </div>

        <Divider />
        
        <button type="button" title="Nadpis 2" className={btn(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 size={18} />
        </button>
        <button type="button" title="Nadpis 3" className={btn(editor.isActive('heading', { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 size={18} />
        </button>
        <button type="button" title="Normální text" className={btn(editor.isActive('paragraph'))} onClick={() => editor.chain().focus().setParagraph().run()}>
          <Type size={18} />
        </button>

        <Divider />
        
        <button type="button" title="Odrážkový seznam" className={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={18} />
        </button>
        <button type="button" title="Číslovaný seznam" className={btn(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={18} />
        </button>
        <button type="button" title="Citace" className={btn(editor.isActive('blockquote'))} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote size={18} />
        </button>

        <Divider />
        
        <button type="button" title="Odkaz" className={btn(editor.isActive('link'))} onClick={addLink}>
          <LinkIcon size={18} />
        </button>
        <button type="button" title="Obrázek" className={btn(false)} onClick={addImage}>
          <ImageIcon size={18} />
        </button>
        <button type="button" title="Video YouTube" className={btn(false)} onClick={addYoutube}>
          <YoutubeIcon size={18} />
        </button>
        <button type="button" title="Vložit tabulku" className={btn(editor.isActive('table'))} onClick={insertTable}>
          <TableIcon size={18} />
        </button>
      </div>
      
      {/* Table secondary toolbar (shown only when inside a table) */}
      {editor.isActive('table') && (
        <div className="flex flex-wrap items-center gap-2 p-2 border-b border-gray-100 bg-blue-50/50 text-xs">
          <span className="font-semibold text-blue-800 ml-1">Nástroje tabulky:</span>
          <button type="button" className="px-2 py-1 bg-white border border-blue-200 rounded hover:bg-blue-100 text-blue-700 transition" onClick={() => editor.chain().focus().addColumnBefore().run()}>+ Sloupec vlevo</button>
          <button type="button" className="px-2 py-1 bg-white border border-blue-200 rounded hover:bg-blue-100 text-blue-700 transition" onClick={() => editor.chain().focus().addColumnAfter().run()}>+ Sloupec vpravo</button>
          <button type="button" className="px-2 py-1 bg-white border border-red-200 rounded hover:bg-red-50 text-red-600 transition" onClick={() => editor.chain().focus().deleteColumn().run()}>Smazat sloupec</button>
          <div className="w-px h-4 bg-blue-200 mx-1" />
          <button type="button" className="px-2 py-1 bg-white border border-blue-200 rounded hover:bg-blue-100 text-blue-700 transition" onClick={() => editor.chain().focus().addRowBefore().run()}>+ Řádek nahoru</button>
          <button type="button" className="px-2 py-1 bg-white border border-blue-200 rounded hover:bg-blue-100 text-blue-700 transition" onClick={() => editor.chain().focus().addRowAfter().run()}>+ Řádek dolů</button>
          <button type="button" className="px-2 py-1 bg-white border border-red-200 rounded hover:bg-red-50 text-red-600 transition" onClick={() => editor.chain().focus().deleteRow().run()}>Smazat řádek</button>
          <div className="w-px h-4 bg-blue-200 mx-1" />
          <button type="button" className="px-2 py-1 bg-white border border-blue-200 rounded hover:bg-blue-100 text-blue-700 transition font-medium" onClick={() => editor.chain().focus().toggleHeaderRow().run()}>Hlavička řádku</button>
          <button type="button" className="px-2 py-1 bg-white border border-red-200 rounded hover:bg-red-100 text-red-700 transition font-bold ml-auto" onClick={() => editor.chain().focus().deleteTable().run()}>Smazat celou tabulku</button>
        </div>
      )}

      {/* Editor Content Area */}
      <div className="flex-1 overflow-y-auto bg-gray-50/30">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

