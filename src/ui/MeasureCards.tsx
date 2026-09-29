import { formatArea, polygonArea } from '../core/annotations';
import { ItemGlyph } from './itemIcons';
import { useEditor, useMeasureDraft } from './useStore';

/** The measurement in progress, listed under Annotations as a temporary row (design 10). */
export function MeasureRow() {
  const d = useMeasureDraft();
  if (!d.a) return null;
  return (
    <div className="mx-3 mt-px flex h-7 items-center rounded-[3px] pr-[7px] pl-[35px]">
      <ItemGlyph icon="measure" className="text-tool" />
      <span className="ml-2 flex-1 truncate text-12 font-medium text-tool">Measure (live)</span>
      <span className="font-mono text-10 text-tool">temp</span>
    </div>
  );
}

/** Net area per room from the room-area annotations, and the total (design 10 "Area schedule"). */
export function AreaScheduleCard() {
  const store = useEditor();
  const format = store.tools.measure.style.format;
  const rooms = store.doc.objects.flatMap((o) => (o.kind === 'annotation' && o.type === 'area' ? o.rooms : []));
  if (!rooms.length) return null;
  const areas = rooms.map((r) => ({ name: r.name, area: polygonArea(r.polygon) }));
  const total = areas.reduce((s, r) => s + r.area, 0);
  return (
    <div className="m-4 shrink-0 rounded-[4px] border border-line bg-sunken px-3 pt-[9px] pb-[10px]">
      <p className="font-mono text-9 font-medium tracking-label-sm text-muted uppercase">Area schedule</p>
      <div className="mt-2 flex flex-col gap-1">
        {areas.map((r) => (
          <div key={r.name} className="flex h-[14px] items-center justify-between">
            <span className="text-11 text-muted">{r.name}</span>
            <span className="font-mono text-10 text-ink">{formatArea(r.area, format)}</span>
          </div>
        ))}
      </div>
      <div className="mt-[7px] flex items-center justify-between border-t border-line pt-[6px]">
        <span className="text-11 font-semibold text-ink">Total net</span>
        <span className="font-mono text-10 font-bold text-ink">{formatArea(total, format)}</span>
      </div>
    </div>
  );
}
