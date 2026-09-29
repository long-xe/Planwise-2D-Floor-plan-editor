import { formatLength } from '../core/annotations';
import { useEditor, useFrameStats, useGhost, useMeasureDraft, useWallDraft } from './useStore';
import { cn } from './cn';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-[6px]">
      <span className="font-mono text-9 font-medium tracking-label-sm text-muted uppercase">{label}</span>
      <span className="font-mono text-10 text-ink">{value}</span>
    </span>
  );
}

type Tone = 'success' | 'accent' | 'tool';
const DOT: Record<Tone, string> = { success: 'bg-success', accent: 'bg-accent', tool: 'bg-tool' };

function Dot({ tone }: { tone: Tone }) {
  return <span className={cn('size-[6px] rounded-full', DOT[tone])} />;
}

function Dotted({ tone, label, value }: { tone: Tone; label: string; value: string }) {
  return (
    <span className="flex items-center gap-[6px]">
      <Dot tone={tone} />
      <Stat label={label} value={value} />
    </span>
  );
}

/** Layers manager (08): layer counts and whether the static cache was reused. */
/** Wall tool (04): where the pointer landed, the segment, and what it snapped to. */
function WallStats() {
  const store = useEditor();
  const stats = useFrameStats();
  const d = useWallDraft();
  const p = d?.end ?? stats.cursor;
  const len = d?.placing ? Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y) : null;
  const walls = store.doc.objects.filter((o) => o.kind === 'wall').length;
  return (
    <>
      <Stat label="X" value={`${p.x.toFixed(2)} m`} />
      <Stat label="Y" value={`${p.y.toFixed(2)} m`} />
      <Stat label="Len" value={len === null ? '—' : `${len.toFixed(2)} m`} />
      <Stat label="Angle" value={d?.placing && d.angle !== null ? `${+d.angle.toFixed(1)}°` : '—'} />
      <Dotted tone="success" label="Snap" value={d?.kind ?? '—'} />
      <Stat label="Walls" value={String(walls)} />
      <Dotted tone="success" label="FPS" value={String(stats.fps)} />
    </>
  );
}

/** Furniture tool (05): the ghost counts as one extra object while it's on the canvas. */
function FurnitureStats() {
  const store = useEditor();
  const stats = useFrameStats();
  const ghost = useGhost();
  const objects = store.doc.objects.length;
  return (
    <>
      <Stat label="X" value={`${stats.cursor.x.toFixed(2)} m`} />
      <Stat label="Y" value={`${stats.cursor.y.toFixed(2)} m`} />
      <Stat label="Zoom" value={`${Math.round(store.viewport.zoom * 100)}%`} />
      <Stat label="Objects" value={ghost ? `${objects} + 1 ghost` : String(objects)} />
      <Dotted tone="success" label="Snap" value={store.snap.grid ? 'grid' : 'off'} />
      <Dotted tone="success" label="FPS" value={String(stats.fps)} />
    </>
  );
}

/** Perf HUD (11): the frame's cost and what it drew. */
function PerfStats() {
  const stats = useFrameStats();
  const p = stats.perf;
  return (
    <>
      <Dotted tone="success" label="FPS" value={String(stats.fps)} />
      <Stat label="Frame" value={`${(p?.frameMs ?? stats.frameMs).toFixed(1)} ms`} />
      <Stat label="Objects" value={String(p?.objects ?? '—')} />
      <Stat label="Visible" value={String(p?.visible ?? '—')} />
      <Stat label="Draw calls" value={String(p?.drawCalls ?? '—')} />
      <Dotted tone="tool" label="Dirty" value={String(p?.dirty.regions.length ?? 0)} />
      <Stat label="Heap" value={p?.heapMB == null ? 'n/a' : `${Math.round(p.heapMB)} MB`} />
    </>
  );
}

/** Measure tool (10): where the pointer is, the live distance, what the end snapped to. */
function MeasureStats() {
  const store = useEditor();
  const stats = useFrameStats();
  const d = useMeasureDraft();
  const f = store.tools.measure.style.format;
  const len = d.a && d.b ? Math.hypot(d.b.point.x - d.a.point.x, d.b.point.y - d.a.point.y) : null;
  const snap = (d.b ?? d.hover)?.kind ?? 'free';
  const annotations = store.doc.objects.filter((o) => o.kind === 'annotation').length;
  return (
    <>
      <Stat label="X" value={`${stats.cursor.x.toFixed(2)} m`} />
      <Stat label="Y" value={`${stats.cursor.y.toFixed(2)} m`} />
      <Dotted tone="tool" label="Distance" value={len === null ? '—' : formatLength(len, f)} />
      <Dotted tone="success" label="Snap" value={snap} />
      <Stat label="Annotations" value={String(annotations)} />
      <Dotted tone="success" label="FPS" value={String(stats.fps)} />
    </>
  );
}

/** History tab (09): where HEAD is, how deep undo / redo go, and the last step taken. */
function HistoryStats() {
  const store = useEditor();
  const stats = useFrameStats();
  const { stack } = store;
  const last = stack.last;
  const verb = last?.kind === 'undo' ? 'Undo' : last?.kind === 'redo' ? 'Redo' : 'Do';
  return (
    <>
      <Stat label="Head" value={`#${stack.headSeq}`} />
      <Stat label="Undo" value={String(stack.undoDepth)} />
      <Dotted tone="accent" label="Redo" value={String(stack.redoDepth)} />
      <Stat label="Objects" value={String(store.doc.objects.length)} />
      <Dotted tone="tool" label="Last" value={last ? `${verb} ${last.cmd.type}` : '—'} />
      <Dotted tone="success" label="FPS" value={String(stats.fps)} />
    </>
  );
}

function LayerStats() {
  const store = useEditor();
  const stats = useFrameStats();
  const layers = store.doc.layers;
  return (
    <>
      <Stat label="Layers" value={String(layers.length)} />
      <Stat label="Visible" value={String(layers.filter((l) => l.visible).length)} />
      <Dotted tone="tool" label="Locked" value={String(layers.filter((l) => l.locked).length)} />
      <Stat label="Objects" value={String(store.doc.objects.length)} />
      <Dotted tone="success" label="Static cache" value={stats.cache === 'none' ? 'off' : stats.cache} />
      <Dotted tone="success" label="FPS" value={String(stats.fps)} />
    </>
  );
}

/**
 * Three layouts from the design: 06 (one object) shows frame time; 07
 * (several selected) swaps it for the last hit-test cost, since picking
 * is what that screen is about; 08 (Layers manager) shows layer state.
 */
export function StatusBar() {
  const store = useEditor();
  const stats = useFrameStats();
  const objects = store.doc.objects.length;
  const multi = store.units.length > 1;
  // Read on the throttled stats tick, not per pointer move.
  const picked = !!(store.hover ?? store.lastHit);
  return (
    <footer className="flex h-statusbar items-center gap-6 border-t border-line bg-surface px-4">
      {store.perf.hud ? (
        <PerfStats />
      ) : store.activeLayerId ? (
        <LayerStats />
      ) : store.history.tab === 'history' ? (
        <HistoryStats />
      ) : store.tools.active === 'wall' ? (
        <WallStats />
      ) : store.tools.active === 'furniture' ? (
        <FurnitureStats />
      ) : store.tools.active === 'measure' ? (
        <MeasureStats />
      ) : (
        <>
          <Stat label="X" value={`${stats.cursor.x.toFixed(2)} m`} />
          <Stat label="Y" value={`${stats.cursor.y.toFixed(2)} m`} />
          <Stat label="Zoom" value={`${Math.round(store.viewport.zoom * 100)}%`} />
          <Stat label="Objects" value={String(objects)} />
          {multi ? (
            <>
              <Dotted tone="accent" label="Selected" value={String(store.selectedCount)} />
              {store.hit.logTimings && picked && (
                <Dotted tone="success" label="Hit test" value={`${store.hitCostMs.toFixed(3)} ms`} />
              )}
              <Dotted tone="success" label="FPS" value={String(stats.fps)} />
            </>
          ) : (
            <>
              <Stat label="Selected" value={String(store.selectedCount)} />
              <Dotted tone="success" label="FPS" value={String(stats.fps)} />
              <Stat label="Frame" value={`${stats.frameMs.toFixed(1)} ms`} />
            </>
          )}
        </>
      )}
      <span className="ml-auto font-mono text-10 text-muted">
        {store.perf.hud ? 'Canvas 2D · requestAnimationFrame · no library' : `Canvas 2D · rAF loop · ${stats.fps} fps`}
      </span>
    </footer>
  );
}
