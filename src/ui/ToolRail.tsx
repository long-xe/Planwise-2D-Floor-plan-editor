import type { ComponentType, SVGProps } from 'react';
import { Icon } from './Icon';
import Select from './icons/select.svg?react';
import Hand from './icons/hand.svg?react';
import Wall from './icons/wall.svg?react';
import Door from './icons/door.svg?react';
import WindowIcon from './icons/window.svg?react';
import Sofa from './icons/sofa.svg?react';
import Text from './icons/text.svg?react';
import Dim from './icons/dim.svg?react';
import Ruler from './icons/ruler.svg?react';
import Note from './icons/note.svg?react';
import grid from './icons/grid.svg';
import magnet from './icons/magnet.svg';
import Bug from './icons/bug.svg?react';
import { cn } from './cn';
import { useEditor } from './useStore';
import type { ToolId } from '../core/toolState';

interface RailItem {
  id: string;
  label: string;
  w: number;
  h: number;
}

/** Modes: inline SVG drawn in currentColor, so the active one turns the tool colour (design: Select in orange). */
interface ModeItem extends RailItem {
  Svg: ComponentType<SVGProps<SVGSVGElement>>;
}

/** Toggles keep their own colours from the design (grid blue, snap green). */
interface ToggleItem extends RailItem {
  src: string;
}

// Select, Hand, Wall and Furniture are wired (06, 04, 05); the rest arrive with their screens.
const TOP: (ModeItem | 'sep')[] = [
  { id: 'select', label: 'Select (V)', Svg: Select, w: 10, h: 14 },
  { id: 'hand', label: 'Hand (H)', Svg: Hand, w: 10, h: 15.75 },
  'sep',
  { id: 'wall', label: 'Wall (W)', Svg: Wall, w: 14, h: 14 },
  { id: 'door', label: 'Door', Svg: Door, w: 16, h: 13 },
  { id: 'window', label: 'Window', Svg: WindowIcon, w: 16, h: 6 },
  { id: 'furniture', label: 'Furniture (F)', Svg: Sofa, w: 16, h: 10 },
  'sep',
  { id: 'text', label: 'Text', Svg: Text, w: 12, h: 13 },
  { id: 'dimension', label: 'Dimension', Svg: Dim, w: 16, h: 8 },
  { id: 'measure', label: 'Measure', Svg: Ruler, w: 16, h: 16 },
  { id: 'note', label: 'Note', Svg: Note, w: 12, h: 14 },
];

const BOTTOM: ToggleItem[] = [
  { id: 'grid', label: 'Grid', src: grid, w: 14, h: 14 },
  { id: 'snap', label: 'Snap', src: magnet, w: 12, h: 14 },
];

const WIRED: readonly ToolId[] = ['select', 'hand', 'wall', 'furniture'];
const isTool = (id: string): id is ToolId => (WIRED as readonly string[]).includes(id);

export function ToolRail() {
  const store = useEditor();
  const active = store.tools.active;
  const button = (t: ModeItem | ToggleItem, size = 'size-9') => {
    const on = t.id === active;
    return (
      <button
        key={t.id}
        type="button"
        title={t.label}
        aria-label={t.label}
        aria-pressed={on}
        aria-disabled={!isTool(t.id)}
        onClick={() => isTool(t.id) && store.tools.setActive(t.id)}
        className={cn(
          'flex items-center justify-center rounded-[4px] border',
          size,
          on ? 'border-tool-border bg-tool-soft text-tool' : 'border-transparent text-ink hover:bg-sunken',
        )}
      >
        {'Svg' in t ? <t.Svg width={t.w} height={t.h} aria-hidden /> : <Icon src={t.src} w={t.w} h={t.h} />}
      </button>
    );
  };
  return (
    <nav aria-label="Tools" className="flex flex-col items-center border-r border-line bg-surface pt-[10px] pb-[6px]">
      <div className="flex flex-col items-center gap-1">
        {TOP.map((t, i) => (t === 'sep' ? <span key={i} className="my-[1.5px] h-px w-6 bg-line" /> : button(t)))}
      </div>
      <div className="mt-auto flex flex-col items-center">
        {BOTTOM.map((t) => button(t, 'size-8'))}
        {/* Design 11: the bug opens the Perf HUD (also F12). */}
        <button
          type="button"
          title="Performance HUD (F12)"
          aria-label="Performance HUD (F12)"
          aria-pressed={store.perf.hud}
          onClick={() => store.perf.setHud(!store.perf.hud)}
          className={cn(
            'flex size-8 items-center justify-center rounded-[4px] hover:bg-sunken',
            store.perf.hud ? 'text-tool' : 'text-ink',
          )}
        >
          <Bug className="h-[14px] w-4" />
        </button>
      </div>
    </nav>
  );
}
