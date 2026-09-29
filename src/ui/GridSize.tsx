import { GRID_STEPS, gridLabel } from '../core/snapping';
import { cn } from './cn';
import { Toggle } from './controls';
import { MonoSegments } from './MonoSegments';
import { useEditor } from './useStore';

/**
 * The grid size, pickable where it's shown ("Snap to grid · 20 cm"): it
 * sets both the snap step and the drawn grid. A native select keeps it
 * keyboard-accessible; styled to read as the plain hint it replaces.
 */
export function GridSizeSelect({ className }: { className?: string }) {
  const store = useEditor();
  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <select
        aria-label="Grid size"
        title="Grid size"
        value={store.snap.gridStep}
        onChange={(e) => store.setSnap({ gridStep: Number(e.target.value) })}
        className="cursor-pointer appearance-none bg-transparent pr-3 font-mono text-10 text-muted hover:text-ink focus:text-ink focus:outline-none"
      >
        {GRID_STEPS.map((s) => (
          <option key={s} value={s}>
            {gridLabel(s)}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-0 text-[8px] text-muted">
        ▾
      </span>
    </span>
  );
}

/**
 * The rail's Grid button (bottom of the tool rail): show or hide the grid,
 * snap to it, and pick its size. Grid visibility is the "Grid & guides"
 * layer, so hiding it is undoable like any layer change.
 */
export function GridPopover({ onClose }: { onClose(): void }) {
  const store = useEditor();
  const grid = store.doc.layers.find((l) => l.id === 'grid');
  return (
    <div
      role="dialog"
      aria-label="Grid"
      className="absolute bottom-0 left-[46px] z-40 w-[232px] rounded-[4px] border border-line bg-surface p-3 shadow-float"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <p className="font-mono text-10 font-medium tracking-label text-muted uppercase">Grid</p>
      <div className="mt-3 flex flex-col gap-3">
        {grid && (
          <div className="flex h-4 items-center justify-between">
            <span className="text-12 text-ink">Show grid</span>
            <Toggle
              label="Show grid"
              tone="success"
              on={grid.visible}
              onChange={(visible) => store.setLayer('ToggleLayer', 'grid', { visible })}
            />
          </div>
        )}
        <div className="flex h-4 items-center justify-between">
          <span className="text-12 text-ink">Snap to grid</span>
          <Toggle label="Snap to grid" on={store.snap.grid} onChange={(on) => store.setSnap({ grid: on })} />
        </div>
      </div>
      <p className="mt-4 text-12 text-ink">Size</p>
      <MonoSegments
        className="mt-1"
        options={GRID_STEPS.map((s) => ({ id: s, label: gridLabel(s) }))}
        value={store.snap.gridStep}
        onChange={(gridStep) => store.setSnap({ gridStep })}
      />
    </div>
  );
}
