import { cn } from './cn';

/**
 * Figma-exported SVG in a fixed slot. The SVG keeps its own width/height
 * (they include stroke overflow), so we centre it rather than stretch it.
 */
export function Icon({ src, w, h, className = '' }: { src: string; w: number; h: number; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center', className)} style={{ width: w, height: h }}>
      <img src={src} alt="" draggable={false} className="block max-w-none" />
    </span>
  );
}
