/** Renderer switches (design 11, Performance → Renderer). */
export interface RenderOptions {
  staticCache: boolean;
  dirtyRects: boolean;
  culling: boolean;
  batching: boolean;
  showDirty: boolean;
}

export const DEFAULT_RENDER: RenderOptions = {
  staticCache: true,
  dirtyRects: true,
  culling: true,
  batching: true,
  showDirty: true,
};

/** 60 Hz: the HUD's "16.7 budget". */
export const FRAME_BUDGET_MS = 1000 / 60;

/** Frame breakdown rows of the rAF loop card, in the order a frame runs them. */
export const PHASES = ['input', 'hitTest', 'update', 'drawStatic', 'drawDynamic', 'composite'] as const;
export type Phase = (typeof PHASES)[number];
export type Phases = Record<Phase, number>;

const zeroPhases = (): Phases => ({ input: 0, hitTest: 0, update: 0, drawStatic: 0, drawDynamic: 0, composite: 0 });

export const frameTotal = (p: Phases): number => PHASES.reduce((s, k) => s + p[k], 0);

/** A frame slower than two vsyncs dropped at least one. */
const LONG_INTERVAL_MS = 2 * FRAME_BUDGET_MS;
/** Longer gaps are the tab being hidden, not a stall. */
const IGNORE_INTERVAL_MS = 1000;
const WINDOW_MS = 60_000;
const HISTORY = 240;

/**
 * Frame timing for the Perf HUD (design 11), pure so it can be tested
 * without a browser. Input and hit-test time accrue between frames; each
 * drawn frame records its phases; every rAF tick checks the vsync gap for
 * long frames — ones where the frame's own work was small are counted as
 * "GC pause" (the main thread was stalled by something else).
 */
export class PerfMonitor {
  /** rAF ticks since start (the "frame 18,402"). */
  frame = 0;
  private input = 0;
  private hitTest = 0;
  private readonly totals = new Float64Array(HISTORY);
  private count = 0;
  private head = 0;
  private sum = zeroPhases();
  private drawn = 0;
  private last = zeroPhases();
  private lastTick = 0;
  private lastWork = 0;
  private longAt: number[] = [];
  private gcAt: number[] = [];
  private cache = { hits: 0, total: 0 };

  addInput(ms: number): void {
    this.input += ms;
  }

  addHitTest(ms: number): void {
    this.hitTest += ms;
  }

  /** Called once per rAF tick, before drawing: flags the gap since the previous tick. */
  tick(now: number): void {
    this.frame++;
    const gap = now - this.lastTick;
    if (this.lastTick && gap > LONG_INTERVAL_MS && gap < IGNORE_INTERVAL_MS) {
      this.longAt.push(now);
      if (this.lastWork < FRAME_BUDGET_MS / 2) this.gcAt.push(now);
    }
    this.lastTick = now;
    this.lastWork = 0;
    const since = now - WINDOW_MS;
    while (this.longAt.length && this.longAt[0]! < since) this.longAt.shift();
    while (this.gcAt.length && this.gcAt[0]! < since) this.gcAt.shift();
  }

  /**
   * One drawn frame: its measured phases plus the input and hit-test time
   * gathered since the last one. Hit-testing happens inside input handlers,
   * so it's taken out of input rather than counted twice.
   */
  record(p: Omit<Phases, 'input' | 'hitTest'>): Phases {
    const hit = Math.min(this.hitTest, this.input);
    const phases: Phases = { input: this.input - hit, hitTest: hit, ...p };
    this.input = 0;
    this.hitTest = 0;
    const total = frameTotal(phases);
    this.totals[this.head] = total;
    this.head = (this.head + 1) % HISTORY;
    this.count = Math.min(this.count + 1, HISTORY);
    for (const k of Object.keys(phases) as Phase[]) this.sum[k] += phases[k];
    this.drawn++;
    this.last = phases;
    this.lastWork = total;
    return phases;
  }

  /** Static layer draws: blitted from cache (hit) or repainted (miss). */
  recordCache(hits: number, misses: number): void {
    this.cache.hits += hits;
    this.cache.total += hits + misses;
    // A rolling window: halve both once it's long enough to keep recent frames weighted.
    if (this.cache.total > 400) {
      this.cache.hits /= 2;
      this.cache.total /= 2;
    }
  }

  get cacheHitRate(): number | null {
    return this.cache.total ? this.cache.hits / this.cache.total : null;
  }

  /** Mean phases over the frames drawn since the last call (for the 4 Hz readouts). */
  takeAverage(): Phases {
    if (!this.drawn) return this.last;
    const out = zeroPhases();
    for (const k of Object.keys(out) as Phase[]) out[k] = this.sum[k] / this.drawn;
    this.sum = zeroPhases();
    this.drawn = 0;
    return out;
  }

  /** The last `n` drawn frame totals, oldest first. */
  history(n = 56): number[] {
    const k = Math.min(n, this.count);
    const out: number[] = [];
    for (let i = k; i > 0; i--) out.push(this.totals[(this.head - i + HISTORY) % HISTORY]!);
    return out;
  }

  /** 95th percentile of the recorded frame totals. */
  get p95(): number {
    if (!this.count) return 0;
    const sorted = this.history(this.count).toSorted((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
  }

  get longFrames(): number {
    return this.longAt.length;
  }

  get gcPauses(): number {
    return this.gcAt.length;
  }
}

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A region the content canvas repainted, and why (design 11: "dirty #1 · moved chair"). */
export interface DirtyRegion extends ScreenRect {
  label: string;
}

/** The Culling minimap (design 11): the plan's cells, how full each is, and the view over them. */
export interface CullSnapshot {
  cols: number;
  rows: number;
  /** Pieces per cell, row by row. */
  counts: number[];
  /** The view in cell units (may reach past the grid). */
  view: { x0: number; y0: number; x1: number; y1: number };
  inView: number;
}

/** What the Perf HUD, Performance tab and status bar read, published a few times a second. */
export interface PerfSnapshot {
  frame: number;
  /** Mean phases of the frames drawn since the last snapshot. */
  phases: Phases;
  frameMs: number;
  /** Recent drawn-frame totals, oldest first (Frame history, HUD sparkline). */
  history: number[];
  p95: number;
  longFrames: number;
  gcPauses: number;
  objects: number;
  /** In view on the last full repaint, and culled by the broadphase. */
  visible: number;
  culled: number;
  drawCalls: number;
  /** The last partial repaint: its regions and how many pieces it redrew. */
  dirty: { regions: DirtyRegion[]; redrawn: number };
  cacheHitRate: number | null;
  staticCache: { w: number; h: number; rebuiltAgoS: number; replaced: number } | null;
  heapMB: number | null;
  dpr: number;
  canvas: { w: number; h: number };
  cull: CullSnapshot | null;
}
