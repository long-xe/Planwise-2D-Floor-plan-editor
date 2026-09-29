import type { ReactNode } from 'react';
import { FRAME_BUDGET_MS, PHASES, type Phase, type PerfSnapshot } from '../core/perf';
import { cn } from './cn';
import { useEditor, useFrameStats } from './useStore';
import Bolt from './icons/bolt.svg?react';

/** Frame breakdown rows (design 11 rAF loop card), colours from the tokens. */
export const PHASE_ROWS: Record<Phase, { label: string; color: string }> = {
  input: { label: 'input', color: 'bg-muted' },
  hitTest: { label: 'hit-test', color: 'bg-accent' },
  update: { label: 'update', color: 'bg-warning' },
  drawStatic: { label: 'draw static (cached)', color: 'bg-success' },
  drawDynamic: { label: 'draw dynamic', color: 'bg-tool' },
  composite: { label: 'composite', color: 'bg-ink' },
};

const ms = (v: number) => `${v.toFixed(1)} ms`;

function Card({ className, children }: { className: string; children: ReactNode }) {
  return (
    <section className={cn('absolute top-9 h-[236px] rounded-[4px] border border-line bg-surface', className)}>
      {children}
    </section>
  );
}

function Header({ left, right }: { left: ReactNode; right: string }) {
  return (
    <div className="flex h-9 items-center justify-between border-b border-line px-3">
      <span className="flex items-center gap-[9px] font-mono text-10 font-medium tracking-label text-ink uppercase">
        {left}
      </span>
      <span className="font-mono text-10 text-muted">{right}</span>
    </div>
  );
}

function Counter({ label, value, tool }: { label: string; value: string; tool?: boolean }) {
  return (
    <div>
      <p className="font-mono text-8 font-medium tracking-[0.16px] text-muted uppercase">{label}</p>
      <p className={cn('font-mono text-12 font-semibold text-ink', tool && 'text-tool')}>{value}</p>
    </div>
  );
}

/** Frame-time sparkline: faster frames sit high, a stall dips (design: "GC 11 ms"). */
function Sparkline({ p }: { p: PerfSnapshot }) {
  const h = p.history;
  const peak = Math.max(12, ...h);
  const pts = h.map((v, i) => `${(i / Math.max(1, h.length - 1)) * 276},${8 + (v / peak) * 30}`).join(' ');
  const worst = h.length ? h.indexOf(Math.max(...h)) : -1;
  const spike = worst >= 0 && h[worst]! > FRAME_BUDGET_MS / 2 ? worst : -1;
  return (
    <div className="relative mx-3 mt-1 h-[46px] rounded-[2px] bg-sunken">
      <svg width={276} height={46} className="absolute inset-0 overflow-visible">
        <line x1={0} x2={276} y1={8} y2={8} className="stroke-success" strokeWidth={1} opacity={0.5} />
        <polyline points={pts} fill="none" className="stroke-success" strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
      {spike >= 0 && (
        <span
          className="absolute top-[30px] font-mono text-[8.5px] leading-[11px] text-tool"
          style={{ left: Math.min(230, (spike / Math.max(1, h.length - 1)) * 276 + 4) }}
        >
          peak {Math.round(h[spike]!)} ms
        </span>
      )}
    </div>
  );
}

function HudCard({ p, fps }: { p: PerfSnapshot; fps: number }) {
  const share = Math.min(1, p.frameMs / FRAME_BUDGET_MS);
  const hit = p.cacheHitRate;
  return (
    <Card className="left-9 w-[300px]">
      <Header
        left={
          <>
            <Bolt className="h-[14px] w-[10px] text-tool" />
            Perf HUD
          </>
        }
        right="F12"
      />
      <div className="flex items-start justify-between px-3 pt-2">
        <p className="flex items-baseline gap-[9px]">
          <span className="font-mono text-[34px] leading-[44px] font-semibold text-ink">{fps}</span>
          <span className="font-mono text-12 text-muted">fps</span>
        </p>
        <div className="mt-1 text-right">
          <p className="font-mono text-16 font-semibold text-ink">{ms(p.frameMs)}</p>
          <p className="mt-px font-mono text-9 text-muted">frame · {FRAME_BUDGET_MS.toFixed(1)} budget</p>
        </div>
      </div>
      <Sparkline p={p} />
      <div className="mx-3 mt-2 h-[6px] rounded-[3px] bg-sunken">
        <div className="h-full rounded-[3px] bg-success" style={{ width: `${share * 100}%` }} />
      </div>
      <p className="mx-3 mt-1 font-mono text-9 text-muted">{Math.round(share * 100)}% of frame budget</p>
      <div className="mx-3 mt-2 grid grid-cols-3 gap-y-[2px]">
        <Counter label="Objects" value={String(p.objects)} />
        <Counter label="Visible" value={String(p.visible)} />
        <Counter label="Culled" value={String(p.culled)} />
        <Counter label="Draw calls" value={String(p.drawCalls)} />
        <Counter label="Dirty rects" value={String(p.dirty.regions.length)} tool />
        <Counter label="Cache hit" value={hit === null ? '—' : `${Math.round(hit * 100)}%`} />
      </div>
    </Card>
  );
}

/** One frame split into its phases against the 16.7 ms vsync (design 11 "rAF loop" card). */
function LoopCard({ p }: { p: PerfSnapshot }) {
  const barPx = 456 / FRAME_BUDGET_MS;
  const ganttPx = Math.min(52, 280 / Math.max(p.frameMs, 0.1));
  // Each phase's bar starts where the previous ones end.
  const starts = PHASES.map((_, i) => PHASES.slice(0, i).reduce((sum, k) => sum + p.phases[k], 0));
  const replaced = p.staticCache?.replaced;
  return (
    <Card className="left-[360px] w-[480px]">
      <Header
        left={`rAF loop · frame ${p.frame.toLocaleString('en-US')}`}
        right={`${p.frameMs.toFixed(1)} / 16.7 ms`}
      />
      <div className="relative mx-3 mt-3 flex h-[14px] gap-px rounded-[2px] bg-sunken">
        {PHASES.map((k) => (
          <span
            key={k}
            className={cn('h-full opacity-85', PHASE_ROWS[k].color)}
            style={{ width: Math.max(1, p.phases[k] * barPx) }}
          />
        ))}
        <span className="ml-4 self-center font-mono text-9 text-faint">
          idle {Math.max(0, FRAME_BUDGET_MS - p.frameMs).toFixed(1)} ms
        </span>
        <span className="absolute -top-1 right-0 h-[22px] w-px bg-tool" />
        <span className="absolute top-[18px] right-2 font-mono text-[8.5px] leading-[11px] text-tool">vsync</span>
      </div>
      <ul className="mx-3 mt-[21px] flex flex-col gap-2">
        {PHASES.map((k, i) => {
          const left = starts[i]!;
          return (
            <li key={k} className="relative flex h-[14px] items-center">
              <span className={cn('size-2 rounded-[2px]', PHASE_ROWS[k].color)} />
              <span className="ml-[6px] text-11 text-ink">{PHASE_ROWS[k].label}</span>
              <span
                className={cn('absolute h-[10px] rounded-[1px] opacity-85', PHASE_ROWS[k].color)}
                style={{ left: 158 + left * ganttPx, width: Math.max(2, p.phases[k] * ganttPx) }}
              />
              <span className="ml-auto font-mono text-10 text-ink">{ms(p.phases[k])}</span>
            </li>
          );
        })}
      </ul>
      <p className="mx-3 mt-[14px] font-mono text-9 text-muted">
        {replaced
          ? `drawImage(staticCache) replaces ${replaced} wall + fixture draws`
          : 'static layers drawn directly this frame'}
      </p>
    </Card>
  );
}

/** Perf HUD over the canvas (design 11), toggled with F12 or the rail's bug button. */
export function PerfHud() {
  const store = useEditor();
  const stats = useFrameStats();
  const p = stats.perf;
  if (!store.perf.hud || !p) return null;
  return (
    <>
      <HudCard p={p} fps={stats.fps} />
      <LoopCard p={p} />
    </>
  );
}
