import { Icon } from './Icon';
import select from './icons/select.svg';
import hand from './icons/hand.svg';
import wall from './icons/wall.svg';
import door from './icons/door.svg';
import windowIcon from './icons/window.svg';
import sofa from './icons/sofa.svg';
import text from './icons/text.svg';
import dim from './icons/dim.svg';
import ruler from './icons/ruler.svg';
import note from './icons/note.svg';
import grid from './icons/grid.svg';
import magnet from './icons/magnet.svg';
import gear from './icons/gear.svg';
import { cn } from './cn';
import { useEditor } from './useStore';
import type { ToolId } from '../core/toolState';

interface RailItem {
  id: string;
  label: string;
  src: string;
  w: number;
  h: number;
}

// Select, Wall and Furniture are wired (06, 04, 05); the rest arrive with their screens.
const TOP: (RailItem | 'sep')[] = [
  { id: 'select', label: 'Select (V)', src: select, w: 10, h: 14 },
  { id: 'hand', label: 'Hand (H)', src: hand, w: 10, h: 15.75 },
  'sep',
  { id: 'wall', label: 'Wall (W)', src: wall, w: 14, h: 14 },
  { id: 'door', label: 'Door', src: door, w: 16, h: 13 },
  { id: 'window', label: 'Window', src: windowIcon, w: 16, h: 6 },
  { id: 'furniture', label: 'Furniture (F)', src: sofa, w: 16, h: 10 },
  'sep',
  { id: 'text', label: 'Text', src: text, w: 12, h: 13 },
  { id: 'dimension', label: 'Dimension', src: dim, w: 16, h: 8 },
  { id: 'measure', label: 'Measure', src: ruler, w: 16, h: 16 },
  { id: 'note', label: 'Note', src: note, w: 12, h: 14 },
];

const BOTTOM: RailItem[] = [
  { id: 'grid', label: 'Grid', src: grid, w: 14, h: 14 },
  { id: 'snap', label: 'Snap', src: magnet, w: 12, h: 14 },
  { id: 'theme', label: 'Theme', src: gear, w: 18, h: 18 },
];

const WIRED: readonly ToolId[] = ['select', 'wall', 'furniture'];
const isTool = (id: string): id is ToolId => (WIRED as readonly string[]).includes(id);

export function ToolRail() {
  const store = useEditor();
  const active = store.tools.active;
  const button = (t: RailItem, size = 'size-9') => (
    <button
      key={t.id}
      type="button"
      title={t.label}
      aria-label={t.label}
      aria-pressed={t.id === active}
      aria-disabled={!isTool(t.id)}
      onClick={() => isTool(t.id) && store.tools.setActive(t.id)}
      className={cn(
        'flex items-center justify-center rounded-[4px] border',
        size,
        t.id === active ? 'border-tool-border bg-tool-soft' : 'border-transparent hover:bg-sunken',
      )}
    >
      <Icon src={t.src} w={t.w} h={t.h} />
    </button>
  );
  return (
    <nav aria-label="Tools" className="flex flex-col items-center border-r border-line bg-surface pt-[10px] pb-[6px]">
      <div className="flex flex-col items-center gap-1">
        {TOP.map((t, i) => (t === 'sep' ? <span key={i} className="my-[1.5px] h-px w-6 bg-line" /> : button(t)))}
      </div>
      <div className="mt-auto flex flex-col items-center">{BOTTOM.map((t) => button(t, 'size-8'))}</div>
    </nav>
  );
}
