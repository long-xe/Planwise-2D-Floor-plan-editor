import type { ReactNode } from 'react';
import { PRECISIONS, type Units, formatLength } from '../core/annotations';
import type { SheetInfo } from '../core/document';
import { contentBounds } from '../core/layerStats';
import { unionRect } from '../geometry/vec';
import { NumberField, Section, Segmented, TextButton, TextField } from './controls';
import { AreaScheduleCard } from './MeasureCards';
import { MonoSegments } from './MonoSegments';
import { useEditor } from './useStore';

const UNIT_OPTIONS: { value: Units; label: string }[] = [
  { value: 'metric', label: 'Metric · m' },
  { value: 'imperial', label: 'Imperial · ft-in' },
];

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={wide ? 'col-span-2' : undefined}>
      <span className="text-11 text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

/** Highest Δ on the plan's revision clouds (0 without any). */
function latestRevision(objects: readonly { kind: string; type?: string; rev?: number }[]): number {
  let rev = 0;
  for (const o of objects) if (o.kind === 'annotation' && o.type === 'revision' && o.rev) rev = Math.max(rev, o.rev);
  return rev;
}

/**
 * Right panel "Document" tab: the plan itself rather than the selection —
 * its name, the title block drawn on the canvas and printed on sheets,
 * units, and the area schedule. Name and title block edits are undoable.
 */
export function DocumentPanel() {
  const store = useEditor();
  const doc = store.doc;
  const sheet: SheetInfo = doc.sheet ?? { project: '', scale: '', drawn: '', rev: 0, date: '' };
  const set = (patch: Partial<SheetInfo>) => store.editSheet(patch);
  const box = doc.layers
    .map((l) => contentBounds(doc, l.id))
    .filter((b) => !!b)
    .reduce<ReturnType<typeof contentBounds>>((a, b) => (a && b ? unionRect(a, b) : (b ?? a)), null);
  const size = box ? `${(box.maxX - box.minX).toFixed(2)} × ${(box.maxY - box.minY).toFixed(2)} m` : 'empty';
  const latest = latestRevision(doc.objects);
  const m = store.tools.measure;
  const format = m.style.format;
  return (
    <>
      <div className="flex h-16 shrink-0 flex-col justify-center border-b border-line px-4">
        <p className="truncate text-13 font-semibold text-ink">{doc.name}</p>
        <p className="mt-[2px] font-mono text-10 text-muted">
          {size} · {doc.objects.length} objects · {doc.layers.length} layers
        </p>
      </div>
      <Section title="Plan" className="pb-[16px]">
        <Field label="Name">
          <TextField label="Plan name" value={doc.name} onCommit={(name) => store.renamePlan(name)} />
        </Field>
      </Section>
      <Section title="Title block" className="pb-[16px]">
        <div className="grid grid-cols-2 gap-x-2 gap-y-3">
          <Field label="Project" wide>
            <TextField label="Project" value={sheet.project} onCommit={(project) => set({ project: project.trim() })} />
          </Field>
          <Field label="Drawn">
            <TextField label="Drawn by" value={sheet.drawn} onCommit={(drawn) => set({ drawn: drawn.trim() })} />
          </Field>
          <Field label="Checked">
            <TextField
              label="Checked by"
              value={sheet.checked ?? ''}
              onCommit={(checked) => set({ checked: checked.trim() })}
            />
          </Field>
          <Field label="Date">
            <TextField label="Date" value={sheet.date} onCommit={(date) => set({ date: date.trim() })} />
          </Field>
          <Field label="Sheet no.">
            <TextField
              label="Sheet number"
              value={sheet.number ?? ''}
              onCommit={(number) => set({ number: number.trim() })}
            />
          </Field>
          <Field label="Scale">
            <TextField label="Scale" value={sheet.scale} onCommit={(scale) => set({ scale: scale.trim() })} />
          </Field>
          <Field label="Revision">
            <NumberField
              label="Δ"
              unit=""
              digits={0}
              value={sheet.rev}
              onCommit={(rev) => set({ rev: Math.max(0, Math.round(rev)) })}
            />
          </Field>
          <Field label="What the revision changed" wide>
            <TextField
              label="Revision note"
              value={sheet.revNote ?? ''}
              onCommit={(revNote) => set({ revNote: revNote.trim() })}
            />
          </Field>
        </div>
        {latest > sheet.rev && (
          <div className="mt-3 flex items-center gap-2 rounded-[3px] bg-sunken px-2 py-[6px]">
            <span className="flex-1 text-11 text-muted">Revision cloud Δ{latest} is newer than this sheet.</span>
            <TextButton className="h-6 px-2 text-11" onClick={() => set({ rev: latest })}>
              Set Rev {latest}
            </TextButton>
          </div>
        )}
        <p className="mt-3 text-11 leading-[15px] text-muted">
          Drawn on the canvas with the Annotations layer, and on every printed sheet.
        </p>
      </Section>
      <Section title="Units & precision" className="pb-[16px]">
        <Segmented
          label="Units"
          font="font-sans"
          options={UNIT_OPTIONS}
          value={format.units}
          onChange={(units) => m.set({ units })}
        />
        <MonoSegments
          className="mt-2"
          options={PRECISIONS[format.units].map((p) => ({
            id: p,
            label: formatLength(p, { ...format, precision: p }),
          }))}
          value={format.precision}
          onChange={(precision) => m.set({ precision })}
        />
        <p className="mt-2 text-11 leading-[15px] text-muted">
          How dimensions, measurements and areas read. A display setting for this session; geometry stays in metres.
        </p>
      </Section>
      <AreaScheduleCard />
    </>
  );
}
