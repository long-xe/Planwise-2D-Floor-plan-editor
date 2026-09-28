import { useEditor, useFrameStats } from './useStore';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-[6px]">
      <span className="font-mono text-9 font-medium uppercase tracking-label-sm text-muted">{label}</span>
      <span className="font-mono text-10 text-ink">{value}</span>
    </span>
  );
}

function Dot({ tone }: { tone: 'success' | 'accent' }) {
  return <span className={`size-[6px] rounded-full ${tone === 'accent' ? 'bg-accent' : 'bg-success'}`} />;
}

function Dotted({ tone, label, value }: { tone: 'success' | 'accent'; label: string; value: string }) {
  return (
    <span className="flex items-center gap-[6px]">
      <Dot tone={tone} />
      <Stat label={label} value={value} />
    </span>
  );
}

/**
 * Two layouts from the design: 06 (one object) shows frame time; 07
 * (several selected) swaps it for the last hit-test cost, since picking
 * is what that screen is about.
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
      <Stat label="X" value={`${stats.cursor.x.toFixed(2)} m`} />
      <Stat label="Y" value={`${stats.cursor.y.toFixed(2)} m`} />
      <Stat label="Zoom" value={`${Math.round(store.viewport.zoom * 100)}%`} />
      <Stat label="Objects" value={String(objects)} />
      {multi ? (
        <>
          <Dotted tone="accent" label="Selected" value={String(store.units.length)} />
          {store.hit.logTimings && picked && <Dotted tone="success" label="Hit test" value={`${store.hitCostMs.toFixed(3)} ms`} />}
          <Dotted tone="success" label="FPS" value={String(stats.fps)} />
        </>
      ) : (
        <>
          <Stat label="Selected" value={String(store.units.length)} />
          <Dotted tone="success" label="FPS" value={String(stats.fps)} />
          <Stat label="Frame" value={`${stats.frameMs.toFixed(1)} ms`} />
        </>
      )}
      <span className="ml-auto font-mono text-10 text-muted">Canvas 2D · rAF loop · {stats.fps} fps</span>
    </footer>
  );
}
