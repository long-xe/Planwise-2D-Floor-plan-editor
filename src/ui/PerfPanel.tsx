import { useEffect, useRef } from 'react';
import type { PerfSnapshot, RenderOptions } from '../core/perf';
import { cn } from './cn';
import { Section, Toggle } from './controls';
import { useEditor, useFrameStats } from './useStore';

const W = 244;
const H = 120;

const RENDERER: { key: keyof RenderOptions; label: string }[] = [
  { key: 'staticCache', label: 'Static layer caching' },
  { key: 'dirtyRects', label: 'Dirty-rect redraw' },
  { key: 'culling', label: 'Viewport culling' },
  { key: 'batching', label: 'Batch same-style paths' },
  { key: 'showDirty', label: 'Show dirty regions' },
];

/** A 244 × 120 preview canvas, redrawn with each stats tick. */
function Preview({ paint }: { paint(g: CanvasRenderingContext2D): void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    paint(g);
  });
  return (
    <canvas ref={ref} style={{ width: W, height: H }} className="block rounded-[3px] border border-line bg-canvas" />
  );
}

/**
 * Scales a `w` × `h` source past filling the preview (cropping the rest),
 * as the design's buffer thumbnails do, with `center` (source px) in the middle.
 */
function fit(w: number, h: number, center = { x: w / 2, y: h / 2 }, zoom = 1.6) {
  const k = Math.max(W / w, H / h) * zoom;
  return { k, x: W / 2 - center.x * k, y: H / 2 - center.y * k };
}

function Buffers({ p }: { p: PerfSnapshot }) {
  const store = useEditor();
  const buffers = store.perf.buffers;
  const cache = p.staticCache;
  const regions = p.dirty.regions;
  return (
    <Section title="Off-screen buffers" className="pt-[23px] pb-4">
      <Preview
        paint={(g) => {
          const src = buffers?.staticCache();
          if (!src || !cache) return;
          const f = fit(cache.w, cache.h);
          g.drawImage(src, f.x, f.y, cache.w * f.k, cache.h * f.k);
        }}
      />
      <p className="mt-[6px] text-12 font-semibold text-ink">Static layer cache</p>
      <p className="mt-[2px] font-mono text-[9.5px] leading-[12px] text-muted">
        {cache
          ? `OffscreenCanvas ${cache.w}×${cache.h} · rebuilt ${Math.round(cache.rebuiltAgoS)} s ago`
          : 'no static layer cached'}
      </p>
      <div className="mt-4">
        <Preview
          paint={(g) => {
            // Transparent checkerboard: only the dirty regions were repainted.
            const css = getComputedStyle(document.documentElement);
            g.fillStyle = css.getPropertyValue('--pw-grid-minor');
            g.globalAlpha = 0.6;
            for (let y = 0; y < H; y += 8) for (let x = (y / 8) % 2 ? 8 : 0; x < W; x += 16) g.fillRect(x, y, 8, 8);
            g.globalAlpha = 1;
            const src = buffers?.content;
            if (!src || !regions.length) return;
            const r0 = regions[0]!;
            // Zoomed so the first region spans about a quarter of the preview.
            const cw = p.canvas.w / p.dpr;
            const ch = p.canvas.h / p.dpr;
            const zoom = Math.min(8, Math.max(1.6, W / 4 / r0.w / Math.max(W / cw, H / ch)));
            const f = fit(cw, ch, { x: r0.x + r0.w / 2, y: r0.y + r0.h / 2 }, zoom);
            for (const r of regions) {
              const [x, y, w, h] = [f.x + r.x * f.k, f.y + r.y * f.k, r.w * f.k, r.h * f.k];
              g.drawImage(src, r.x * p.dpr, r.y * p.dpr, r.w * p.dpr, r.h * p.dpr, x, y, w, h);
              g.fillStyle = css.getPropertyValue('--pw-tool');
              g.globalAlpha = 0.2;
              g.fillRect(x, y, w, h);
              g.globalAlpha = 1;
            }
          }}
        />
      </div>
      <p className="mt-[6px] text-12 font-semibold text-ink">Dynamic layer</p>
      <p className="mt-[2px] font-mono text-[9.5px] leading-[12px] text-muted">
        {regions.length
          ? `redrawn in ${regions.length} dirty rect${regions.length > 1 ? 's' : ''} · ${p.dirty.redrawn} objects`
          : 'repainted whole on the last change'}
      </p>
    </Section>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'tool' | 'success' }) {
  return (
    <div className="flex h-4 items-center">
      <span className="w-[120px] text-12 text-muted">{label}</span>
      <span
        className={cn(
          'flex-1 text-right font-mono text-11 text-ink',
          tone === 'tool' && 'text-tool',
          tone === 'success' && 'text-success',
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Right panel's Performance tab (design 11): buffers, renderer switches, budget. */
export function PerfPanel() {
  const store = useEditor();
  const stats = useFrameStats();
  const p = stats.perf;
  const opts = store.perf.options;
  const stress = new URLSearchParams(location.search).get('plan') === 'northgate';
  return (
    <>
      {p && <Buffers p={p} />}
      <Section title="Renderer" className="pb-[18px]">
        <div className="flex flex-col gap-3">
          {RENDERER.map((r) => (
            <div key={r.key} className="flex h-4 items-center justify-between">
              <span className="text-12 text-ink">{r.label}</span>
              <Toggle
                label={r.label}
                on={opts[r.key]}
                tone={r.key === 'showDirty' ? 'tool' : 'success'}
                onChange={(on) => store.perf.setOption(r.key, on)}
              />
            </div>
          ))}
        </div>
      </Section>
      {p && (
        <Section title="Budget">
          <div className="flex flex-col gap-2">
            <Row label="devicePixelRatio" value={p.dpr.toFixed(1)} />
            <Row label="Canvas size" value={`${p.canvas.w} × ${p.canvas.h} px`} />
            <Row label="JS heap" value={p.heapMB === null ? 'n/a' : `${p.heapMB.toFixed(1)} MB`} />
            <Row
              label="Long frames (60 s)"
              value={p.gcPauses ? `${p.longFrames} · GC pause` : String(p.longFrames)}
              {...(p.longFrames ? { tone: 'tool' as const } : {})}
            />
            <Row label="p95 frame" value={`${p.p95.toFixed(1)} ms`} tone={p.p95 < 16.7 ? 'success' : 'tool'} />
          </div>
          <a
            href={stress ? location.pathname : '?plan=northgate'}
            className="mt-4 block font-mono text-10 text-accent hover:underline"
          >
            {stress ? '← Back to Harbor St. · Unit 4B' : 'Open stress plan · Northgate, 842 objects →'}
          </a>
        </Section>
      )}
    </>
  );
}
