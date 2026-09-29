/**
 * Vector PDF from the sheet's SVG (design 12 "PDF · vector · print"), via
 * jsPDF + svg2pdf.js. Both load only when a PDF is exported, and the IBM
 * Plex TrueType files (public/fonts, SIL OFL) are fetched once and
 * embedded, so the PDF is set in the same type as the screen. jsPDF
 * subsets each font to the glyphs used.
 */

/** File, family and the style key svg2pdf asks jsPDF for (400 "normal", 700 "bold", others "<weight>normal"). */
const FONTS = [
  ['IBMPlexSans-Regular.ttf', 'IBM Plex Sans', 'normal'],
  ['IBMPlexSans-Medium.ttf', 'IBM Plex Sans', '500normal'],
  ['IBMPlexSans-SemiBold.ttf', 'IBM Plex Sans', '600normal'],
  ['IBMPlexSans-Bold.ttf', 'IBM Plex Sans', 'bold'],
  ['IBMPlexMono-Regular.ttf', 'IBM Plex Mono', 'normal'],
  ['IBMPlexMono-Medium.ttf', 'IBM Plex Mono', '500normal'],
] as const;

let fontCache: Promise<string[]> | null = null;

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  // Chunks keep String.fromCharCode under the argument-count limit.
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function loadFonts(): Promise<string[]> {
  fontCache ??= Promise.all(
    FONTS.map(async ([file]) => {
      const res = await fetch(`${import.meta.env.BASE_URL}fonts/${file}`);
      if (!res.ok) throw new Error(`Font ${file} failed to load (${res.status})`);
      return base64(await res.arrayBuffer());
    }),
  ).catch((err: unknown) => {
    // Let the next export try again rather than caching the failure.
    fontCache = null;
    throw err;
  });
  return fontCache;
}

/** One page `w` × `h` points, drawn from an SVG whose viewBox is that page in points. */
export async function svgToPdf(svg: string, w: number, h: number, title: string): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }, fonts] = await Promise.all([import('jspdf'), import('svg2pdf.js'), loadFonts()]);
  const pdf = new jsPDF({ unit: 'pt', format: [w, h], orientation: w > h ? 'landscape' : 'portrait', compress: true });
  FONTS.forEach(([file, family, style], i) => {
    pdf.addFileToVFS(file, fonts[i]!);
    pdf.addFont(file, family, style);
  });
  const el = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  await svg2pdf(el, pdf, { x: 0, y: 0, width: w, height: h });
  pdf.setProperties({ title, creator: 'Planwise' });
  return pdf.output('blob');
}
