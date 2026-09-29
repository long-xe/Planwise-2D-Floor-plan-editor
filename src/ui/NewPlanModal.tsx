import { useEffect, useMemo, useRef, useState } from 'react';
import { type TemplateId, TEMPLATES, buildPlan, templateSummary } from '../library/templates';
import { cn } from './cn';
import { Icon } from './Icon';
import { type BoardSettings, PlanSettings } from './PlanSettings';
import { TemplateThumb } from './TemplateThumb';
import { fitView, importProject, useWorkspace } from './workspace';
import check from './icons/check.svg';
import Close from './icons/export-close.svg?react';
import Upload from './icons/export-download.svg?react';

// Design 03 defaults: the 2-bedroom picked, 12 × 8.4 m, 20 cm grid, 5 cm and 15° snaps.
const DEFAULTS: BoardSettings = {
  name: 'Maple Loft · 2-bedroom',
  units: 'metric',
  floorHeight: 2.7,
  w: 12,
  h: 8.4,
  lock: true,
  grid: 0.2,
  position: 0.05,
  angle: 15,
  exterior: 0.2,
  interior: 0.12,
};

/**
 * New plan (design 03): pick a starting point — blank board, studio,
 * 2-bedroom or open office, each built at the size set on the right — or
 * import a project file. Create opens it as the current plan.
 */
export function NewPlanModal() {
  const ws = useWorkspace();
  const [template, setTemplate] = useState<TemplateId>('two-bed');
  const [s, setS] = useState<BoardSettings>(DEFAULTS);
  const [nameTouched, setNameTouched] = useState(false);
  const [dragging, setDragging] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<BoardSettings>) => {
    if (patch.name !== undefined) setNameTouched(true);
    setS((prev) => ({ ...prev, ...patch }));
  };

  // Each card shows its template at the template's own size.
  const cards = useMemo(
    () =>
      TEMPLATES.map((t) => {
        const doc = buildPlan(t.id, { ...DEFAULTS, ...t.size, name: t.planName });
        return { t, doc, summary: templateSummary(t, doc) };
      }),
    [],
  );
  const doc = useMemo(
    () =>
      buildPlan(template, {
        name: s.name.trim() || 'Untitled plan',
        w: s.w,
        h: s.h,
        floorHeight: s.floorHeight,
        exterior: s.exterior,
        interior: s.interior,
      }),
    [template, s.name, s.w, s.h, s.floorHeight, s.exterior, s.interior],
  );

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ws.showNewPlan(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [ws]);

  const pick = (id: TemplateId) => {
    const t = TEMPLATES.find((x) => x.id === id)!;
    setTemplate(id);
    setS((prev) => ({ ...prev, ...t.size, ...(nameTouched ? {} : { name: t.planName }) }));
  };

  const create = () => {
    ws.open(doc, (store) => {
      store.tools.measure.set({ units: s.units });
      store.tools.setWall({ thickness: s.interior, height: s.floorHeight });
      store.setSnap({ gridStep: s.grid, positionStep: s.position, angleStep: s.angle });
      // A blank board starts with the Wall tool in hand (design: "walls tool ready").
      if (template === 'blank') store.tools.setActive('wall');
      fitView(store, { minX: 0, minY: 0, maxX: s.w, maxY: s.h });
    });
    ws.showNewPlan(false);
  };

  const importFile = async (f: File | undefined) => {
    if (f && (await importProject(f, ws))) ws.showNewPlan(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim"
      onMouseDown={() => ws.showNewPlan(false)}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="New plan"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-[760px] max-h-[96vh] w-[1080px] flex-col overflow-hidden rounded-[6px] bg-surface"
      >
        <header className="flex h-[92px] shrink-0 items-start border-b border-line pt-[26px] pr-5 pl-8">
          <div className="flex-1">
            <h2 className="text-[22px] leading-[29px] font-semibold text-ink">New plan</h2>
            <p className="mt-[3px] text-13 text-muted">
              Pick a starting point and set up the drafting board. Everything can be changed later in Document settings.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => ws.showNewPlan(false)}
            className="flex size-7 items-center justify-center rounded-[3px] bg-sunken"
          >
            <Close aria-hidden className="size-3 text-ink" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[468px_1px_1fr] overflow-y-auto">
          <section className="pt-[22px] pl-8">
            <p className="font-mono text-10 font-medium tracking-label text-muted uppercase">1 · Start from</p>
            <div className="mt-[11px] grid w-[404px] grid-cols-2 gap-3">
              {cards.map(({ t, doc: preview, summary }) => {
                const on = t.id === template;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pick(t.id)}
                    className={cn(
                      'relative h-[194px] rounded-[4px] border border-line bg-surface p-2 text-left hover:border-faint',
                      on && 'border-2 border-accent p-[7px] hover:border-accent',
                    )}
                  >
                    <TemplateThumb doc={preview} blank={t.id === 'blank'} />
                    <p className="mt-[10px] px-1 text-13 font-semibold text-ink">{t.name}</p>
                    <p className="mt-[3px] truncate px-1 font-mono text-[9.5px] leading-3 whitespace-nowrap text-muted">
                      {summary}
                    </p>
                    {on && (
                      <span className="absolute top-[13px] right-[9px] flex size-5 items-center justify-center rounded-full bg-accent">
                        <Icon src={check} w={8} h={6} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => file.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void importFile(e.dataTransfer.files[0]);
              }}
              className={cn(
                'mt-6 flex h-[92px] w-[404px] items-start rounded-[4px] border border-dashed border-faint bg-sunken pt-5 pl-[22px] text-left',
                dragging && 'border-accent bg-accent-tint',
              )}
            >
              <Upload aria-hidden className="mt-[10px] h-[14px] w-[17px] rotate-180 text-muted" />
              <span className="ml-[13px]">
                <span className="block text-13 font-semibold text-ink">Import a plan</span>
                <span className="mt-[3px] block text-12 text-muted">
                  Drop a .planwise.json project, or click to browse
                </span>
                <span className="mt-1 block font-mono text-10 text-faint">exported from Export &amp; print · JSON</span>
              </span>
            </button>
            <input
              ref={file}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                void importFile(f);
              }}
            />
          </section>
          <span className="my-4 bg-line" />
          <PlanSettings s={s} set={set} />
        </div>

        <footer className="flex h-12 shrink-0 items-center border-t border-line pr-6 pl-8">
          <span className="flex size-[14px] items-center justify-center rounded-full border border-muted font-mono text-[9px] text-muted">
            i
          </span>
          <p className="ml-2 flex-1 font-mono text-[10.5px] text-muted">
            World {Math.round(s.w * 50)} × {Math.round(s.h * 50)} px @ 50 px/m · ~{doc.objects.length} objects from
            template
          </p>
          <button
            type="button"
            onClick={() => ws.showNewPlan(false)}
            className="h-[35px] rounded-[4px] border border-line bg-surface px-4 text-13 font-medium text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={create}
            className="ml-4 h-[33px] rounded-[4px] bg-tool px-[18px] text-13 font-semibold text-surface"
          >
            Create plan&nbsp;&nbsp;→
          </button>
        </footer>
      </div>
    </div>
  );
}
