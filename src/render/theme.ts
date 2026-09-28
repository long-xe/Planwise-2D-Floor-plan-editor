// Canvas colours come from the same tokens.css as the UI, read once at start
// (and again on theme change) so nothing is hardcoded in draw code.

export interface CanvasTheme {
  canvas: string;
  ink: string;
  inkMuted: string;
  inkFaint: string;
  border: string;
  surface: string;
  surfaceSunken: string;
  accent: string;
  tool: string;
  gridMinor: string;
  glass: string;
  gridMajor: string;
  fontMono: string;
  fontSans: string;
}

const VARS: Record<keyof CanvasTheme, string> = {
  canvas: '--pw-canvas',
  ink: '--pw-ink',
  inkMuted: '--pw-ink-muted',
  inkFaint: '--pw-ink-faint',
  border: '--pw-border',
  surface: '--pw-surface',
  surfaceSunken: '--pw-surface-sunken',
  accent: '--pw-accent',
  tool: '--pw-tool',
  gridMinor: '--pw-grid-minor',
  glass: '--pw-glass',
  gridMajor: '--pw-grid-major',
  fontMono: '--pw-font-mono',
  fontSans: '--pw-font-sans',
};

export function readTheme(el: Element = document.documentElement): CanvasTheme {
  const cs = getComputedStyle(el);
  const out = {} as CanvasTheme;
  for (const key of Object.keys(VARS) as (keyof CanvasTheme)[]) {
    out[key] = cs.getPropertyValue(VARS[key]).trim();
  }
  return out;
}
