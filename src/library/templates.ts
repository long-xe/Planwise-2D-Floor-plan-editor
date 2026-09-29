import type { Annotation } from '../core/annotations';
import type { Doc, Furniture, Layer, Opening, SceneObject, Wall } from '../core/document';
import type { Vec2 } from '../geometry/vec';
import { catalogItem } from './catalog';
import { createDemoDoc } from './demoScene';

// New plan templates (design 03). Each builds a document at any W × H:
// 2-bedroom stretches the Harbor St. plan, the studio and the open office
// are laid out from the size, and Blank is an empty board.

export type TemplateId = 'blank' | 'studio' | 'two-bed' | 'office';

/** Board settings from the New plan dialog that shape the document itself. */
export interface PlanShape {
  name: string;
  w: number;
  h: number;
  floorHeight: number;
  exterior: number;
  interior: number;
}

export interface Template {
  id: TemplateId;
  name: string;
  /** Size and name the dialog fills in when the template is picked. */
  size: { w: number; h: number };
  planName: string;
}

export const TEMPLATES: readonly Template[] = [
  { id: 'blank', name: 'Blank', size: { w: 12, h: 8.4 }, planName: 'Untitled plan' },
  { id: 'studio', name: 'Studio apartment', size: { w: 7.2, h: 5.3 }, planName: 'Studio apartment' },
  { id: 'two-bed', name: '2-bedroom', size: { w: 12, h: 8.4 }, planName: 'Maple Loft · 2-bedroom' },
  { id: 'office', name: 'Open office', size: { w: 24, h: 20 }, planName: 'Open office' },
];

const layer = (id: string, name: string, color: string, order: number): Layer => ({
  id,
  name,
  color,
  order,
  locked: false,
  opacity: 1,
  visible: true,
  // Design 12 prints everything but the wiring and the drafting grid.
  includeInPrint: id !== 'electrical' && id !== 'grid',
  snapTargets: true,
  cacheAsStatic: false,
});

const baseLayers = (): Layer[] => [
  layer('annotations', 'Annotations', '#E0A526', 3),
  layer('furniture', 'Furniture', '#D9623B', 2),
  layer('walls', 'Walls', '#1B2A41', 1),
  layer('grid', 'Grid & guides', '#C9D5E6', 0),
];

const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

function emptyDoc(s: PlanShape): Doc {
  return {
    name: s.name,
    sheet: {
      project: 'Floor plan · Level 01',
      scale: '1:50 @ A3',
      drawn: 'M. Rivera',
      rev: 0,
      date: today(),
      number: 'A-101',
    },
    layers: baseLayers(),
    groups: [],
    objects: [],
  };
}

/** Builds pieces with ids, walls with openings, and catalog furniture. */
function builder(s: PlanShape) {
  const objects: SceneObject[] = [];
  let n = 0;
  const id = (p: string) => `${p}${String(++n).padStart(3, '0')}`;
  return {
    objects,
    wall(ax: number, ay: number, bx: number, by: number, exterior: boolean, name?: string): Wall {
      const w: Wall = {
        kind: 'wall',
        id: id('w_'),
        layerId: 'walls',
        a: { x: ax, y: ay },
        b: { x: bx, y: by },
        thickness: exterior ? s.exterior : s.interior,
        height: s.floorHeight,
        ...(name ? { name } : {}),
      };
      objects.push(w);
      return w;
    },
    cut(w: Wall, type: Opening['type'], offset: number, width: number): void {
      const o: Opening = { kind: 'opening', id: id('o_'), layerId: 'walls', wallId: w.id, type, offset, width };
      if (type === 'door') Object.assign(o, { hinge: 'start', swing: 1 });
      objects.push(o);
    },
    piece(catalogId: string, x: number, y: number, rotation = 0, size?: { w: number; h: number }): void {
      const item = catalogItem(catalogId)!;
      const f: Furniture = {
        kind: 'furniture',
        id: id('f_'),
        layerId: 'furniture',
        name: item.title,
        icon: item.icon,
        transform: { x, y, w: size?.w ?? item.w, h: size?.h ?? item.d, rotation, flipX: false },
        footprint: item.footprint.map((p) => ({ ...p })),
        appearance: { ...item.appearance },
        catalogId,
      };
      objects.push(f);
    },
  };
}

/** Exterior walls on the centreline of a w × h outline (outer faces at 0 and w, h). */
function shell(b: ReturnType<typeof builder>, s: PlanShape) {
  const t = s.exterior / 2;
  return {
    north: b.wall(t, t, s.w - t, t, true, 'Exterior · North'),
    south: b.wall(t, s.h - t, s.w - t, s.h - t, true, 'Exterior · South'),
    west: b.wall(t, t, t, s.h - t, true, 'Exterior · West'),
    east: b.wall(s.w - t, t, s.w - t, s.h - t, true, 'Exterior · East'),
  };
}

function studio(s: PlanShape): Doc {
  const b = builder(s);
  const { north, south, west } = shell(b, s);
  const bathW = Math.min(2.4, s.w * 0.35);
  const bathH = Math.min(2.1, s.h * 0.4);
  const t = s.exterior;
  const bathWall = b.wall(s.w - bathW, t, s.w - bathW, bathH, false, 'Bath / Studio');
  b.wall(s.w - bathW, bathH, s.w - t, bathH, false, 'Bath / Kitchen');
  b.cut(bathWall, 'door', Math.max(0.2, bathH - t - 1.0), 0.8);
  b.cut(west, 'door', s.h / 2 - 0.45, 0.9);
  b.cut(north, 'window', 1.0, Math.min(2.4, s.w - bathW - 2));
  b.cut(south, 'window', s.w / 2 - 1.2, 2.4);
  b.piece('bed-king', t + 1.1, t + 1.15);
  b.piece('sofa-3s', (s.w - bathW) / 2 + 0.6, s.h - t - 0.5, 180);
  b.piece('coffee-table', (s.w - bathW) / 2 + 0.6, s.h - t - 1.6);
  b.piece('counter-cooktop', s.w - t - 0.3, bathH + 1.4, 90, { w: Math.min(2.24, s.h - bathH - t - 0.4), h: 0.6 });
  b.piece('bathtub', s.w - bathW / 2, t + 0.4, 0, { w: Math.min(1.7, bathW - 0.3), h: 0.75 });
  b.piece('toilet', s.w - t - 0.35, bathH - 0.45, 90);
  b.piece('basin', s.w - bathW + 0.5, bathH - 0.3, 180);
  b.piece('plant', t + 0.4, s.h - t - 0.4);
  return { ...emptyDoc(s), objects: b.objects };
}

function office(s: PlanShape): Doc {
  const b = builder(s);
  const { north, south } = shell(b, s);
  const pitch = { x: 4.9, y: 3.0 };
  const cols = Math.max(1, Math.floor((s.w - 2.4 + 1.3) / pitch.x));
  const rows = Math.max(1, Math.floor((s.h - 2.6 + 0.8) / pitch.y));
  const x0 = (s.w - (cols * pitch.x - 1.3)) / 2;
  const y0 = (s.h - (rows * pitch.y - 0.8)) / 2 + 0.2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (let i = 0; i < 4; i++) {
        const x = x0 + c * pitch.x + 0.45 + i * 0.9;
        const up = i % 2 === 0;
        const y = y0 + r * pitch.y;
        b.piece('desk', x, y + 0.35, up ? 180 : 0, { w: 0.9, h: 0.7 });
        b.piece('office-chair', x, y + (up ? -0.25 : 0.95), up ? 0 : 180, { w: 0.45, h: 0.45 });
      }
    }
  }
  for (let i = 0; i < Math.floor(s.w / 4); i++) {
    b.cut(north, 'window', 1 + i * 4, 2.4);
    b.cut(south, 'window', 1 + i * 4, 2.4);
  }
  b.piece('plant', s.exterior + 0.5, s.exterior + 0.5);
  b.piece('plant', s.w - s.exterior - 0.5, s.h - s.exterior - 0.5);
  return { ...emptyDoc(s), objects: b.objects };
}

const wallLength = (x: Wall) => Math.hypot(x.b.x - x.a.x, x.b.y - x.a.y);

const scalePoint = (p: Vec2, sx: number, sy: number): Vec2 => ({ x: p.x * sx, y: p.y * sy });

/** The Harbor St. plan stretched to w × h: walls, openings and annotations scale, furniture moves but keeps its size. */
function twoBed(s: PlanShape): Doc {
  const base = createDemoDoc();
  const sx = s.w / 12;
  const sy = s.h / 8.4;
  const walls = new Map<string, { before: Wall; after: Wall }>();
  const objects = base.objects.map((o): SceneObject => {
    if (o.kind === 'wall') {
      const after: Wall = {
        ...o,
        a: scalePoint(o.a, sx, sy),
        b: scalePoint(o.b, sx, sy),
        thickness: o.thickness >= 0.2 ? s.exterior : s.interior,
        height: s.floorHeight,
      };
      walls.set(o.id, { before: o, after });
      return after;
    }
    if (o.kind === 'furniture')
      return { ...o, transform: { ...o.transform, x: o.transform.x * sx, y: o.transform.y * sy } };
    if (o.kind === 'annotation') return scaleAnnotation(o, sx, sy);
    return o;
  });
  // Openings keep their place along the wall, in proportion to its new length.
  const fixed = objects.map((o) => {
    if (o.kind !== 'opening') return o;
    const w = walls.get(o.wallId);
    if (!w) return o;
    const k = wallLength(w.after) / wallLength(w.before);
    return { ...o, offset: o.offset * k };
  });
  return {
    ...base,
    name: s.name,
    layers: base.layers.map((l) => ({ ...l, locked: false, cacheAsStatic: false })),
    objects: fixed,
  };
}

function scaleAnnotation(a: Annotation, sx: number, sy: number): Annotation {
  const P = (p: Vec2) => scalePoint(p, sx, sy);
  switch (a.type) {
    case 'dimension':
      return { ...a, runs: a.runs.map((r) => ({ ...r, points: r.points.map(P) })) };
    case 'area':
      return { ...a, rooms: a.rooms.map((r) => ({ ...r, label: P(r.label), polygon: r.polygon.map(P) })) };
    case 'callout':
    case 'note':
      return { ...a, anchor: P(a.anchor), box: P(a.box) };
    case 'revision':
      return { ...a, cloud: a.cloud.map(P), tag: P(a.tag) };
    case 'text':
      return { ...a, at: P(a.at) };
  }
}

export function buildPlan(id: TemplateId, s: PlanShape): Doc {
  if (id === 'studio') return studio(s);
  if (id === 'two-bed') return twoBed(s);
  if (id === 'office') return office(s);
  return emptyDoc(s);
}

/** Card subtitle ("38 m² · 1 room + bath"), from the plan the template builds at `size`. */
export function templateSummary(t: Template, doc: Doc): string {
  const a = t.size.w * t.size.h;
  const area = Number.isInteger(a) ? String(a) : a.toFixed(a >= 100 ? 1 : 0);
  if (t.id === 'blank') return 'Empty board · walls tool ready';
  if (t.id === 'studio') return `${area} m² · 1 room + bath`;
  if (t.id === 'office')
    return `${area} m² · ${doc.objects.filter((o) => o.kind === 'furniture' && o.catalogId === 'desk').length} desks`;
  return `${area} m² · 5 rooms`;
}
