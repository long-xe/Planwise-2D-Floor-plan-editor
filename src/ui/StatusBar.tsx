import { Icon } from './Icon';
import { useEditor, useFrameStats } from './useStore';
import statusDot from './icons/status-dot.svg';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-[6px]">
      <span className="font-mono text-9 font-medium uppercase tracking-label-sm text-muted">{label}</span>
      <span className="font-mono text-10 text-ink">{value}</span>
    </span>
  );
}

export function StatusBar() {
  const store = useEditor();
  const stats = useFrameStats();
  const objects = store.doc.objects.length;
  return (
    <footer className="flex h-statusbar items-center gap-6 border-t border-line bg-surface px-4">
      <Stat label="X" value={`${stats.cursor.x.toFixed(2)} m`} />
      <Stat label="Y" value={`${stats.cursor.y.toFixed(2)} m`} />
      <Stat label="Zoom" value={`${Math.round(store.viewport.zoom * 100)}%`} />
      <Stat label="Objects" value={String(objects)} />
      <Stat label="Selected" value={String(store.selection.length)} />
      <span className="flex items-center gap-[6px]">
        <Icon src={statusDot} w={6} h={6} />
        <Stat label="FPS" value={String(stats.fps)} />
      </span>
      <Stat label="Frame" value={`${stats.frameMs.toFixed(1)} ms`} />
      <span className="ml-auto font-mono text-10 text-muted">Canvas 2D · rAF loop · {stats.fps} fps</span>
    </footer>
  );
}
