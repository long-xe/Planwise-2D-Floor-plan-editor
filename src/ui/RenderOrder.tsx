import { layerStatus } from '../core/layerStats';
import { useEditor, useFrameStats } from './useStore';
import { cn } from './cn';

/** Layers manager (08): layers bottom-up as the renderer paints them, with what each costs per frame. */
export function RenderOrder() {
  const store = useEditor();
  const stats = useFrameStats();
  const bottomUp = store.doc.layers.toSorted((a, b) => a.order - b.order);
  return (
    <>
      <p className="mt-4 font-mono text-10 font-medium tracking-label text-muted uppercase">Render order · per frame</p>
      <div className="mt-[7px] flex flex-col gap-1">
        {bottomUp.map((l, i) => {
          const status = layerStatus(l);
          const [text, tone] =
            status === 'hidden'
              ? ['skipped · hidden', 'text-faint']
              : // The grid is painted as lines behind everything, not as objects.
                l.id === 'grid'
                ? ['background · grid lines', 'text-muted']
                : status === 'static cache'
                  ? ['static cache · redrawn on edit', 'text-success']
                  : [`dynamic · ${stats.layerDraws[l.id] ?? 0} draws`, 'text-accent'];
          return (
            <div
              key={l.id}
              className="flex h-[30px] items-center rounded-[3px] border border-line bg-sunken pr-2 pl-[9px]"
            >
              <span className="w-[18px] font-mono text-10 text-faint">{i + 1}</span>
              <span className="size-[10px] rounded-[2px]" style={{ background: l.color }} />
              <span className="ml-2 flex-1 truncate text-12 font-medium text-ink">{l.name}</span>
              <span className={cn('font-mono text-[9.5px] leading-3', tone)}>{text}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-11 leading-4 text-muted">
        Bottom row paints first. Locked layers are rasterised once into an off-screen canvas and blitted each frame.
      </p>
    </>
  );
}
