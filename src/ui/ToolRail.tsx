import { useEffect, useRef, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
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
import Cloud from './icons/revision.svg?react';
import Bolt from './icons/bolt.svg?react';
import GridIcon from './icons/grid.svg?react';
import MagnetIcon from './icons/magnet.svg?react';
import Bug from './icons/bug.svg?react';
import { cn } from './cn';
import { useEditor } from './useStore';
import { GridPopover } from './GridSize';
import { RailTip, type TipContent } from './RailTip';
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
  tip: TipContent;
}

// Every tool on the rail is wired.
const TOP: (ModeItem | 'sep')[] = [
  {
    id: 'select',
    label: 'Select (V)',
    Svg: Select,
    w: 10,
    h: 14,
    tip: { name: 'Select', keys: ['V'], how: 'Click · Shift+click adds · drag a marquee' },
  },
  {
    id: 'hand',
    label: 'Hand (H)',
    Svg: Hand,
    w: 10,
    h: 15.75,
    tip: { name: 'Hand', keys: ['H'], how: 'Drag to pan · or hold Space in any tool' },
  },
  'sep',
  {
    id: 'wall',
    label: 'Wall (W)',
    Svg: Wall,
    w: 14,
    h: 14,
    tip: { name: 'Wall', keys: ['W'], how: 'Click points · Shift free angle · Enter close' },
  },
  {
    id: 'door',
    label: 'Door (D)',
    Svg: Door,
    w: 16,
    h: 13,
    tip: { name: 'Door', keys: ['D'], how: 'Click a wall · Shift flips the hinge' },
  },
  {
    id: 'window',
    label: 'Window (O)',
    Svg: WindowIcon,
    w: 16,
    h: 6,
    tip: { name: 'Window', keys: ['O'], how: 'Click a wall to cut a window' },
  },
  {
    id: 'furniture',
    label: 'Furniture (F)',
    Svg: Sofa,
    w: 16,
    h: 10,
    tip: { name: 'Furniture', keys: ['F'], how: 'Drag from the Library · ⌘K search' },
  },
  {
    id: 'electrical',
    label: 'Electrical (E)',
    Svg: Bolt,
    w: 12,
    h: 15,
    tip: { name: 'Electrical', keys: ['E'], how: 'Outlets & switches snap to walls · lights · 1 2 3' },
  },
  'sep',
  {
    id: 'text',
    label: 'Text (T)',
    Svg: Text,
    w: 12,
    h: 13,
    tip: { name: 'Text', keys: ['T'], how: 'Labels · or name a room (its area is automatic)' },
  },
  {
    id: 'dimension',
    label: 'Dimension (L)',
    Svg: Dim,
    w: 16,
    h: 8,
    tip: { name: 'Dimension', keys: ['L'], how: 'Click · click · pull out · click' },
  },
  {
    id: 'measure',
    label: 'Measure (M)',
    Svg: Ruler,
    w: 16,
    h: 16,
    tip: { name: 'Measure', keys: ['M'], how: 'Click · click · Enter keeps it as a dimension' },
  },
  {
    id: 'note',
    label: 'Note (N)',
    Svg: Note,
    w: 12,
    h: 14,
    tip: { name: 'Note', keys: ['N'], how: 'Sticky note · or a callout with a leader' },
  },
  {
    id: 'revision',
    label: 'Revision cloud (R)',
    Svg: Cloud,
    w: 16,
    h: 12,
    tip: { name: 'Revision cloud', keys: ['R'], how: 'Drag a box, or click points · Enter closes' },
  },
];

const WIRED: readonly ToolId[] = [
  'select',
  'hand',
  'wall',
  'door',
  'window',
  'furniture',
  'electrical',
  'text',
  'dimension',
  'measure',
  'note',
  'revision',
];
const isTool = (id: string): id is ToolId => (WIRED as readonly string[]).includes(id);

export function ToolRail() {
  const store = useEditor();
  const active = store.tools.active;
  const [gridOpen, setGridOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  // Plans without a grid layer (the stress plan) always show the grid.
  const gridShown = store.doc.layers.find((l) => l.id === 'grid')?.visible ?? true;

  useEffect(() => {
    if (!gridOpen) return;
    const away = (e: PointerEvent) => {
      if (!gridRef.current?.contains(e.target as Node)) setGridOpen(false);
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [gridOpen]);
  const button = (t: ModeItem, size = 'size-9') => {
    const on = t.id === active;
    return (
      <RailTip key={t.id} tip={t.tip}>
        {(tipId) => (
          <button
            type="button"
            aria-label={t.label}
            aria-describedby={tipId}
            aria-pressed={on}
            aria-disabled={!isTool(t.id)}
            onClick={() => isTool(t.id) && store.tools.setActive(t.id)}
            className={cn(
              'flex items-center justify-center rounded-[4px] border',
              size,
              on ? 'border-tool-border bg-tool-soft text-tool' : 'border-transparent text-ink hover:bg-sunken',
            )}
          >
            <t.Svg width={t.w} height={t.h} aria-hidden />
          </button>
        )}
      </RailTip>
    );
  };
  return (
    <nav aria-label="Tools" className="flex flex-col items-center border-r border-line bg-surface pt-[10px] pb-[6px]">
      <div className="flex flex-col items-center gap-1">
        {TOP.map((t, i) => (t === 'sep' ? <span key={i} className="my-[1.5px] h-px w-6 bg-line" /> : button(t)))}
      </div>
      <div className="mt-auto flex flex-col items-center">
        <div ref={gridRef} className="relative">
          <RailTip
            hidden={gridOpen}
            tip={{ name: `Grid · ${gridShown ? 'shown' : 'hidden'}`, how: 'Show or hide the grid · grid size' }}
          >
            {(tipId) => (
              <button
                type="button"
                aria-label="Grid"
                aria-describedby={tipId}
                aria-expanded={gridOpen}
                onClick={() => setGridOpen((o) => !o)}
                className={cn(
                  'flex size-8 items-center justify-center rounded-[4px] hover:bg-sunken',
                  gridShown ? 'text-accent' : 'text-muted',
                  gridOpen && 'bg-sunken',
                )}
              >
                <GridIcon width={14} height={14} aria-hidden />
              </button>
            )}
          </RailTip>
          {gridOpen && <GridPopover onClose={() => setGridOpen(false)} />}
        </div>
        <RailTip
          tip={{
            name: `Snap to grid · ${store.snap.grid ? 'on' : 'off'}`,
            how: 'Drags land on the grid · hold Alt to skip it',
          }}
        >
          {(tipId) => (
            <button
              type="button"
              aria-label="Snap to grid"
              aria-describedby={tipId}
              aria-pressed={store.snap.grid}
              onClick={() => store.setSnap({ grid: !store.snap.grid })}
              className={cn(
                'flex size-8 items-center justify-center rounded-[4px] hover:bg-sunken',
                store.snap.grid ? 'text-success' : 'text-muted',
              )}
            >
              <MagnetIcon width={12} height={14} aria-hidden />
            </button>
          )}
        </RailTip>
        {/* Design 11: the bug opens the Perf HUD (also F12). */}
        <RailTip tip={{ name: 'Performance HUD', keys: ['F12'], how: 'FPS · frame time · draw calls · culling' }}>
          {(tipId) => (
            <button
              type="button"
              aria-label="Performance HUD (F12)"
              aria-describedby={tipId}
              aria-pressed={store.perf.hud}
              onClick={() => store.perf.setHud(!store.perf.hud)}
              className={cn(
                'flex size-8 items-center justify-center rounded-[4px] hover:bg-sunken',
                store.perf.hud ? 'text-tool' : 'text-ink',
              )}
            >
              <Bug className="h-[14px] w-4" />
            </button>
          )}
        </RailTip>
      </div>
    </nav>
  );
}
