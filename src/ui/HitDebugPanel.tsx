import { useSyncExternalStore } from 'react';
import type { HitReport } from '../core/picking';
import { HIT_CELL_M } from '../core/spatialIndex';
import { Toggle } from './controls';
import { Icon } from './Icon';
import { useEditor } from './useStore';
import bug from './icons/bug.svg';
import { cn } from './cn';
import { objectLabel } from '../core/structure';

function Row({ label, value, miss }: { label: string; value: string; miss?: boolean }) {
  return (
    <div className="flex h-[14px] items-center justify-between">
      <span className="text-11 text-muted">{label}</span>
      <span className={cn('font-mono text-[10.5px] leading-[14px] text-ink', miss && 'text-tool')}>{value}</span>
    </div>
  );
}

function hitLabel(store: ReturnType<typeof useEditor>, r: HitReport): string {
  if (r.id) {
    const o = store.hitIndex.get(r.id);
    return o ? objectLabel(o) : r.id;
  }
  // A miss after polygon tests is the interesting case: inside a bbox, outside the shape.
  return r.tested.length ? 'none (outside polygon)' : 'none';
}

/**
 * Floating "Hit-test debug" card and legend over the canvas (design 07),
 * shown with "Show hit regions". Placed where the design puts them: under
 * the plan, flush with its left wall, running into the status bar.
 */
export function HitDebugPanel() {
  const store = useEditor();
  const report = useSyncExternalStore(store.subscribeHover, store.getHover);
  if (!store.hit.showRegions) return null;
  const r = report;
  return (
    <>
      <div className="absolute bottom-[-8px] left-[138px] h-[196px] w-[268px] overflow-hidden rounded-[4px] border border-line bg-surface shadow-float">
        <div className="flex items-center pt-3 pr-3 pl-[14px]">
          <Icon src={bug} w={14} h={13} />
          <span className="ml-2 flex-1 font-mono text-10 font-medium tracking-label text-ink uppercase">
            Hit-test debug
          </span>
          <Toggle label="Show hit regions" tone="tool" on onChange={() => store.setHit({ showRegions: false })} />
        </div>
        <div className="absolute inset-x-3 top-[41px] flex flex-col gap-2">
          <Row label="pointer" value={r ? `${r.pointer.x.toFixed(2)}, ${r.pointer.y.toFixed(2)} m` : '—'} />
          <Row label="broadphase" value={`uniform grid ${HIT_CELL_M} m`} />
          <Row label="bbox candidates" value={r ? String(r.candidates) : '—'} />
          <Row label="polygon tests" value={r ? String(r.polygonTests) : '—'} />
          <Row label="hit" value={r ? hitLabel(store, r) : '—'} miss={!!r && !r.id} />
          <Row label="cost" value={r ? `${store.hitCostMs.toFixed(3)} ms` : '—'} />
        </div>
        <p className="absolute inset-x-0 bottom-0 h-5 bg-sunken pt-1 pl-3 font-mono text-9 text-muted">
          {store.hit.mode === 'polygon'
            ? 'pointInPolygon(p, poly) · even-odd'
            : 'pointInRect(p, bbox) · no polygon step'}
        </p>
      </div>

      <div className="absolute bottom-[134px] left-[420px] h-[54px] w-[268px] rounded-[4px] border border-line bg-surface">
        <span className="absolute top-[11px] left-[11px] h-[10px] w-[14px] border border-tool bg-tool-region" />
        <span className="absolute top-2 left-[31px] text-11 text-ink">polygon hit region</span>
        <span className="absolute top-[31px] left-[11px] h-[10px] w-[14px] border border-dashed border-accent" />
        <span className="absolute top-7 left-[31px] text-11 text-ink">marquee ({store.hit.marquee})</span>
        <span className="absolute top-[11px] left-[145px] h-[10px] w-[14px] border-[1.5px] border-accent" />
        <span className="absolute top-2 left-[165px] text-11 text-ink">selected</span>
      </div>
    </>
  );
}
