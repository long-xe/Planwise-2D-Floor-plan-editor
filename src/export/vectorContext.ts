import { type Paint, type Seg, type Stroke, type VectorOp, parseColor, parseFont } from './vectorTypes';

import { ellipseBeziers, traceRoundRect } from './vectorCurves';

export type { Paint, Seg, Stroke, VectorOp } from './vectorTypes';
export { parseColor, parseFont } from './vectorTypes';

/**
 * A recording stand-in for CanvasRenderingContext2D (design 12 vector
 * export): the same drawing code that paints the canvas runs against it,
 * and it keeps what would have been painted as device-space vector ops —
 * paths already transformed (arcs, ellipses and rounded rects as cubic
 * Béziers), clips, and text with its rotation — for the PDF and SVG
 * writers. Only the part of the Canvas 2D API the renderer uses exists.
 */

type M = [number, number, number, number, number, number];

interface State {
  m: M;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  lineCap: CanvasLineCap;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  dash: number[];
}

export class VectorContext {
  readonly ops: VectorOp[] = [];
  // Canvas 2D state the renderer sets, as plain fields; save() / restore() snapshot them.
  fillStyle = '#000000';
  strokeStyle = '#000000';
  lineWidth = 1;
  lineJoin: CanvasLineJoin = 'miter';
  lineCap: CanvasLineCap = 'butt';
  globalAlpha = 1;
  font = '10px sans-serif';
  textAlign: CanvasTextAlign = 'left';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  private m: M = [1, 0, 0, 1, 0, 0];
  private dash: number[] = [];
  private stack: State[] = [];
  private path: Seg[] = [];
  private cur: { x: number; y: number } | null = null;
  private start: { x: number; y: number } | null = null;
  private measurer: OffscreenCanvasRenderingContext2D | null = null;

  constructor(private readonly measure?: (font: string, text: string) => number) {}

  setLineDash(d: number[]): void {
    this.dash = [...d];
  }

  getLineDash(): number[] {
    return [...this.dash];
  }

  save(): void {
    this.stack.push({
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      lineJoin: this.lineJoin,
      lineCap: this.lineCap,
      globalAlpha: this.globalAlpha,
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      m: [...this.m] as M,
      dash: [...this.dash],
    });
    this.ops.push({ t: 'save' });
  }

  restore(): void {
    const prev = this.stack.pop();
    if (!prev) return;
    Object.assign(this, prev);
    this.ops.push({ t: 'restore' });
  }

  // --- transform -----------------------------------------------------------
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.m = [a, b, c, d, e, f];
  }

  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    const [A, B, C, D, E, F] = this.m;
    this.m = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
  }

  translate(x: number, y: number): void {
    this.transform(1, 0, 0, 1, x, y);
  }

  rotate(r: number): void {
    this.transform(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0);
  }

  scale(x: number, y: number): void {
    this.transform(x, 0, 0, y, 0, 0);
  }

  private p(x: number, y: number): { x: number; y: number } {
    const [a, b, c, d, e, f] = this.m;
    return { x: a * x + c * y + e, y: b * x + d * y + f };
  }

  /** How much the current transform scales lengths (line widths, font sizes). */
  private get k(): number {
    const [a, b, c, d] = this.m;
    return Math.sqrt(Math.abs(a * d - b * c));
  }

  // --- path ----------------------------------------------------------------
  beginPath(): void {
    this.path = [];
    this.cur = null;
    this.start = null;
  }

  moveTo(x: number, y: number): void {
    const q = this.p(x, y);
    this.path.push({ t: 'M', ...q });
    this.cur = q;
    this.start = q;
  }

  lineTo(x: number, y: number): void {
    if (!this.cur) return this.moveTo(x, y);
    const q = this.p(x, y);
    this.path.push({ t: 'L', ...q });
    this.cur = q;
  }

  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    if (!this.cur) this.moveTo(x1, y1);
    const a = this.p(x1, y1);
    const b = this.p(x2, y2);
    const q = this.p(x, y);
    this.path.push({ t: 'C', x1: a.x, y1: a.y, x2: b.x, y2: b.y, x: q.x, y: q.y });
    this.cur = q;
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    // Needs the current point in local space: invert the transform once.
    const [a, b, c, d, e, f] = this.m;
    const det = a * d - b * c || 1;
    const cur = this.cur ?? this.p(cx, cy);
    const lx = (d * (cur.x - e) - c * (cur.y - f)) / det;
    const ly = (-b * (cur.x - e) + a * (cur.y - f)) / det;
    this.bezierCurveTo(
      lx + (2 / 3) * (cx - lx),
      ly + (2 / 3) * (cy - ly),
      x + (2 / 3) * (cx - x),
      y + (2 / 3) * (cy - y),
      x,
      y,
    );
  }

  closePath(): void {
    if (!this.path.length) return;
    this.path.push({ t: 'Z' });
    this.cur = this.start;
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }

  roundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    radii: number | DOMPointInit | (number | DOMPointInit)[] = 0,
  ): void {
    const r0 = typeof radii === 'number' ? radii : Array.isArray(radii) && typeof radii[0] === 'number' ? radii[0] : 0;
    const r = Math.max(0, Math.min(r0, Math.abs(w) / 2, Math.abs(h) / 2));
    if (r === 0) return this.rect(x, y, w, h);
    traceRoundRect(this, x, y, w, h, r);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false): void {
    const [start, ...curves] = ellipseBeziers(cx, cy, rx, ry, rot, a0, a1, ccw);
    if (this.cur) this.lineTo(start![4], start![5]);
    else this.moveTo(start![4], start![5]);
    for (const c of curves) this.bezierCurveTo(...c);
  }

  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw = false): void {
    this.ellipse(cx, cy, r, r, 0, a0, a1, ccw);
  }

  // --- painting ------------------------------------------------------------
  private paint(style: string): Paint {
    const c = parseColor(style);
    return { color: c.color, alpha: c.alpha * this.globalAlpha };
  }

  private strokeOf(): Stroke {
    return {
      ...this.paint(this.strokeStyle),
      width: this.lineWidth * this.k,
      dash: this.dash.map((x) => x * this.k),
      join: this.lineJoin,
      cap: this.lineCap,
    };
  }

  fill(): void {
    if (this.path.length) this.ops.push({ t: 'path', d: [...this.path], fill: this.paint(this.fillStyle) });
  }

  stroke(): void {
    if (this.path.length) this.ops.push({ t: 'path', d: [...this.path], stroke: this.strokeOf() });
  }

  clip(): void {
    if (this.path.length) this.ops.push({ t: 'clip', d: [...this.path] });
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const saved = this.path;
    this.beginPath();
    this.rect(x, y, w, h);
    this.fill();
    this.path = saved;
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    const saved = this.path;
    this.beginPath();
    this.rect(x, y, w, h);
    this.stroke();
    this.path = saved;
  }

  /** The sheet starts from blank paper; nothing to clear in a recording. */
  clearRect(): void {}

  measureText(text: string): TextMetrics {
    let width: number;
    if (this.measure) width = this.measure(this.font, text);
    else {
      // A real canvas measures with the page's fonts; without one (tests), an average advance.
      this.measurer ??= typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(1, 1).getContext('2d');
      if (this.measurer) {
        this.measurer.font = this.font;
        width = this.measurer.measureText(text).width;
      } else width = text.length * parseFont(this.font).size * 0.55;
    }
    return { width } as TextMetrics;
  }

  fillText(text: string, x: number, y: number): void {
    const f = parseFont(this.font);
    // Baselines as offsets of the font size from the alphabetic line.
    const shift =
      this.textBaseline === 'top' || this.textBaseline === 'hanging'
        ? 0.8
        : this.textBaseline === 'middle'
          ? 0.33
          : this.textBaseline === 'bottom'
            ? -0.2
            : 0;
    const q = this.p(x, y + shift * f.size);
    const [a, b] = this.m;
    const align =
      this.textAlign === 'center'
        ? 'center'
        : this.textAlign === 'right' || this.textAlign === 'end'
          ? 'right'
          : 'left';
    this.ops.push({
      t: 'text',
      text,
      x: q.x,
      y: q.y,
      angle: Math.atan2(b, a),
      size: f.size * this.k,
      weight: f.weight,
      mono: f.mono,
      align,
      paint: this.paint(this.fillStyle),
    });
  }

  /** The static-layer cache isn't used when exporting; images are ignored. */
  drawImage(): void {}
}
