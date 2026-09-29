import { useEffect, useRef } from 'react';
import type { CatalogItem } from '../library/catalog';
import { drawSymbol } from '../render/drawSymbol';

/**
 * A catalog piece drawn by the canvas renderer itself, so a Library card
 * shows exactly what lands on the plan. `scale` multiplies the thumbnail
 * size from the design (1 in cards, larger in the Properties preview).
 */
export function SymbolThumb({
  item,
  fill,
  width,
  height,
  scale = 1,
}: {
  item: CatalogItem;
  fill: string;
  width: number;
  height: number;
  scale?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    g.translate(width / 2, height / 2);
    drawSymbol(g, item.parts, { ...item.appearance, fill }, item.thumb.w * scale, item.thumb.h * scale, 1);
  }, [item, fill, width, height, scale]);
  return <canvas ref={ref} aria-hidden style={{ width, height }} className="block" />;
}
