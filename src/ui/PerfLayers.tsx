import { layersTopDown } from '../core/document';
import { FRAME_BUDGET_MS, type PerfSnapshot } from '../core/perf';
import { CULL_CELL_M } from '../render/cullIndex';
import { cn } from './cn';
import { Icon } from './Icon';
import { LeftTabs } from './PanelTabs';
import { useEditor, useFrameStats } from './useStore';
import eye from './icons/eye.svg';
import lock from './icons/lock.svg';

const GRID_W = 228;
const GRID_H = 150;
const HIST_H = 64;
const CELL_PITCH = 19;
/** Frame history: 3 px per ms, so the 16.7 ms budget line sits 50 px up (design). */
const PX_PER_MS = 3;

const clamp = (n: number, hi: number) => Math.max(0, Math.min(hi, n));

function SectionLabel({ children }: { children: string }) {
  return <p className="font-mono text-10 font-medium tracking-label text-muted uppercase">{children}</p>;
}

/** Culling minimap: the plan's 4 m cells, shaded by how full they are, and the view over them. */
function HashGrid({ p }: { p: PerfSnapshot }) {
  const c = p.cull;
  if (!c) return null;
  // Design: 17 px cells 2 px apart, filling the box; smaller when the plan needs more.
  const pitch = Math.min(CELL_PITCH, (GRID_H - 2) / c.rows, (GRID_W - 2) / c.cols);
  const cols = Math.floor((GRID_W - 2) / pitch);
  const rows = Math.floor((GRID_H - 2) / pitch);
  const ox = 1;
  const oy = 1;
  const max = Math.max(1, ...c.counts);
  const v = c.view;
  return (
    <svg width={GRID_W} height={GRID_H} className="mt-[7px] rounded-[3px] border border-line bg-canvas">
      {Array.from({ length: cols * rows }, (_, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const n = col < c.cols && row < c.rows ? c.counts[row * c.cols + col]! : 0;
        const seen = col + 1 > v.x0 && col < v.x1 && row + 1 > v.y0 && row < v.y1;
        return (
          <rect
            key={i}
            x={ox + col * pitch + 1}
            y={oy + row * pitch + 1}
            width={pitch - 2}
            height={pitch - 2}
            rx={1}
            className={seen && n ? 'fill-success' : 'fill-line'}
            opacity={seen && n ? 0.25 + 0.4 * (n / max) : 0.5}
          />
        );
      })}
      <rect
        x={ox + clamp(v.x0, c.cols) * pitch}
        y={oy + clamp(v.y0, c.rows) * pitch}
        width={(clamp(v.x1, c.cols) - clamp(v.x0, c.cols)) * pitch}
        height={(clamp(v.y1, c.rows) - clamp(v.y0, c.rows)) * pitch}
        fill="none"
        className="stroke-accent"
        strokeWidth={1.5}
        strokeDasharray="3 2"
      />
    </svg>
  );
}

function FrameHistory({ p }: { p: PerfSnapshot }) {
  const base = HIST_H - 4;
  return (
    <svg width={GRID_W} height={HIST_H} className="mt-[5px] rounded-[3px] border border-line bg-sunken">
      {p.history.map((v, i) => {
        const h = Math.min(base - 2, Math.max(1, v * PX_PER_MS));
        return (
          <rect
            key={i}
            x={4 + i * 4}
            y={base - h}
            width={3}
            height={h}
            className={v > FRAME_BUDGET_MS ? 'fill-tool' : 'fill-success'}
            opacity={0.8}
          />
        );
      })}
      <line
        x1={0}
        x2={GRID_W}
        y1={base - FRAME_BUDGET_MS * PX_PER_MS}
        y2={base - FRAME_BUDGET_MS * PX_PER_MS}
        className="stroke-tool"
        strokeDasharray="3 2"
      />
    </svg>
  );
}

/**
 * Left panel while the Perf HUD is up (design 11): each layer's object
 * count and whether it's served from the static cache, the culling grid,
 * and the recent frame times against the budget.
 */
export function PerfLayers() {
  const store = useEditor();
  const stats = useFrameStats();
  const p = stats.perf;
  const layers = layersTopDown(store.doc);
  const count = (id: string) => store.doc.objects.filter((o) => o.layerId === id).length;
  const cached = (l: (typeof layers)[number]) => (l.locked || l.cacheAsStatic) && store.perf.options.staticCache;
  return (
    <aside className="flex min-h-0 w-left flex-col border-r border-line bg-surface">
      <LeftTabs />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-[15px] pb-4">
        <p className="px-1 font-mono text-10 font-medium tracking-label text-muted uppercase">
          Layers · {layers.length}
        </p>
        <div className="mt-[9px] flex flex-col gap-2">
          {layers.map((l) => (
            <div key={l.id} className="flex h-[54px] items-start rounded-[4px] border border-line bg-sunken px-3 pt-2">
              <span className="mt-1 size-[10px] shrink-0 rounded-[2px]" style={{ background: l.color }} />
              <div className="ml-2 min-w-0 flex-1">
                <p className={cn('truncate text-12 font-semibold text-ink', !l.visible && 'text-muted')}>{l.name}</p>
                <p className="mt-[3px] font-mono text-[9.5px] leading-[12px] text-muted">
                  {count(l.id)} obj · {cached(l) ? 'static' : 'dynamic'}
                  {!l.visible && ' · hidden'}
                </p>
              </div>
              <span className="mt-[5px] mr-[2px] flex">
                {l.locked ? <Icon src={lock} w={9} h={11} /> : <Icon src={eye} w={14} h={6} />}
              </span>
            </div>
          ))}
        </div>
        {p && (
          <div className="px-1">
            <div className="mt-5">
              <SectionLabel>Culling · spatial hash</SectionLabel>
              <HashGrid p={p} />
              {p.cull && (
                <p className="mt-[5px] font-mono text-[9.5px] leading-[12px] text-muted">
                  {p.cull.cols * p.cull.rows} cells · {p.cull.inView} in view · {CULL_CELL_M} m cells
                </p>
              )}
            </div>
            <div className="mt-[14px]">
              <SectionLabel>Frame history</SectionLabel>
              <FrameHistory p={p} />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
