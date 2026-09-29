import type { Seg, VectorOp } from './vectorContext';

const n = (v: number) => +v.toFixed(2);

export function pathData(d: readonly Seg[]): string {
  return d
    .map((s) =>
      s.t === 'Z'
        ? 'Z'
        : s.t === 'C'
          ? `C${n(s.x1)} ${n(s.y1)} ${n(s.x2)} ${n(s.y2)} ${n(s.x)} ${n(s.y)}`
          : `${s.t}${n(s.x)} ${n(s.y)}`,
    )
    .join('');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FONTS =
  "@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');";

/**
 * SVG from recorded vector ops (design 12 "SVG · vector · web"): one
 * <path> per fill or stroke, <text> with its rotation, clips as nested
 * groups. Sized in millimetres so it prints and imports at true scale.
 */
export function buildSvg(ops: readonly VectorOp[], w: number, h: number, mm: { w: number; h: number }): string {
  const out: string[] = [];
  const open: number[] = [];
  let clips = 0;
  let depth = 0;
  for (const op of ops) {
    if (op.t === 'save') depth++;
    else if (op.t === 'restore') {
      while (open.length && open.at(-1)! >= depth) {
        out.push('</g>');
        open.pop();
      }
      depth--;
    } else if (op.t === 'clip') {
      const id = `c${++clips}`;
      out.push(`<clipPath id="${id}"><path d="${pathData(op.d)}"/></clipPath><g clip-path="url(#${id})">`);
      open.push(depth);
    } else if (op.t === 'path') {
      const a: string[] = [`d="${pathData(op.d)}"`];
      if (op.fill) {
        a.push(`fill="${op.fill.color}"`);
        if (op.fill.alpha < 1) a.push(`fill-opacity="${n(op.fill.alpha)}"`);
      } else a.push('fill="none"');
      if (op.stroke) {
        const s = op.stroke;
        a.push(`stroke="${s.color}" stroke-width="${n(s.width)}"`);
        if (s.alpha < 1) a.push(`stroke-opacity="${n(s.alpha)}"`);
        if (s.dash.length) a.push(`stroke-dasharray="${s.dash.map(n).join(' ')}"`);
        if (s.join !== 'miter') a.push(`stroke-linejoin="${s.join}"`);
        if (s.cap !== 'butt') a.push(`stroke-linecap="${s.cap}"`);
      }
      out.push(`<path ${a.join(' ')}/>`);
    } else {
      const anchor = op.align === 'center' ? 'middle' : op.align === 'right' ? 'end' : 'start';
      const family = op.mono ? "'IBM Plex Mono', monospace" : "'IBM Plex Sans', sans-serif";
      const rot = op.angle ? ` transform="rotate(${n((op.angle * 180) / Math.PI)} ${n(op.x)} ${n(op.y)})"` : '';
      const alpha = op.paint.alpha < 1 ? ` fill-opacity="${n(op.paint.alpha)}"` : '';
      out.push(
        `<text xml:space="preserve" x="${n(op.x)}" y="${n(op.y)}" font-family="${family}" font-size="${n(op.size)}" font-weight="${op.weight}" fill="${op.paint.color}"${alpha} text-anchor="${anchor}"${rot}>${esc(op.text)}</text>`,
      );
    }
  }
  while (open.pop() !== undefined) out.push('</g>');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${mm.w}mm" height="${mm.h}mm" viewBox="0 0 ${n(w)} ${n(h)}">`,
    // CDATA: the font URL's `&` would otherwise be an XML entity.
    `<style><![CDATA[${FONTS}]]></style>`,
    ...out,
    '</svg>',
  ].join('\n');
}
