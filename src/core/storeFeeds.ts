import { Channel } from './channel';
import { type HitReport, hitLogLine } from './picking';
import { DEFAULT_HIT, type FrameStats, type HitSettings } from './storeTypes';

/**
 * How the store tells the outside world something changed, split from
 * the editor state itself: the main feed React panels subscribe to (and
 * the `dirty` flag the render loop polls), plus two fast feeds — frame
 * stats and hover picks — that only their own readers follow.
 */
export abstract class StoreFeeds {
  /** Set on any visible change; the render loop clears it after drawing. */
  dirty = true;
  hit: HitSettings = { ...DEFAULT_HIT };
  /** Result of the last click pick (Hit test card, status bar). */
  lastHit: HitReport | null = null;
  /** Result of the latest hover pick (debug panel, hit-region overlay). */
  hover: HitReport | null = null;
  /**
   * Running mean of pick cost. Browsers quantise performance.now() (100 µs
   * without cross-origin isolation) while one pick takes a few µs, so a
   * single sample reads 0 or 0.1; the average of many converges on the truth.
   */
  hitCostMs = 0;
  stats: FrameStats = { fps: 0, frameMs: 0, cursor: { x: 0, y: 0 }, cache: 'none', layerDraws: {}, perf: null };
  private version = 0;
  private readonly feed = new Channel();
  private readonly statsFeed = new Channel();
  private readonly hoverFeed = new Channel();

  /** The frame monitor's hit-test phase (Perf HUD). */
  protected abstract recordPick(ms: number): void;

  subscribe = this.feed.subscribe;
  getVersion = (): number => this.version;
  /** Separate, throttled channel so per-frame numbers don't re-render panels. */
  subscribeStats = this.statsFeed.subscribe;
  getStats = (): FrameStats => this.stats;
  /** Hover picks fire on every pointer move; only the debug panel listens. */
  subscribeHover = this.hoverFeed.subscribe;
  getHover = (): HitReport | null => this.hover;

  changed(): void {
    this.dirty = true;
    this.version++;
    this.feed.emit();
  }

  publishStats(stats: FrameStats): void {
    this.stats = stats;
    this.statsFeed.emit();
  }

  setHit(patch: Partial<HitSettings>): void {
    this.hit = { ...this.hit, ...patch };
    this.changed();
  }

  setHover(report: HitReport | null): void {
    this.hover = report;
    if (report) this.sampleCost(report);
    if (this.hit.showRegions || this.hit.showBroadphase) this.dirty = true;
    this.hoverFeed.emit();
  }

  setLastHit(hit: HitReport | null): void {
    this.lastHit = hit;
    if (hit) this.sampleCost(hit);
    if (hit && this.hit.logTimings) console.debug(hitLogLine(hit, this.hitCostMs));
  }

  private sampleCost(r: HitReport): void {
    this.hitCostMs = this.hitCostMs === 0 ? r.ms : this.hitCostMs * 0.95 + r.ms * 0.05;
    this.recordPick(r.ms);
  }
}
