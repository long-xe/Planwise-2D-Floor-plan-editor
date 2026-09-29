import { circuitsOf, nextCircuitId } from '../core/circuits';
import type { Furniture } from '../core/document';
import { findLayer } from '../core/document';
import { gridLabel } from '../core/snapping';
import { FIXTURES, FIXTURE_KINDS, electricalLayer } from '../library/electrical';
import { CircuitChips } from './CircuitChips';
import { cn } from './cn';
import { Section } from './controls';
import { FixtureThumb } from './FixtureThumb';
import { ItemGlyph } from './itemIcons';
import { useEditor } from './useStore';

const SHORTCUTS: [string, string][] = [
  ['1 2 3', 'outlet · switch · light'],
  ['Esc', 'done'],
];

/** Right panel of the Electrical tool: which fixture, which circuit, how it lands. */
export function ElectricalPanel() {
  const store = useEditor();
  const es = store.tools.electrical;
  const spec = FIXTURES[es.kind];
  const color = (findLayer(store.doc, 'electrical') ?? electricalLayer(store.doc)).color;
  return (
    <>
      <div className="flex h-16 shrink-0 items-start gap-[10px] border-b border-line px-4 pt-[15px]">
        <span className="flex size-9 items-center justify-center rounded-[3px] bg-tool-soft">
          <ItemGlyph icon="outlet" className="text-tool" />
        </span>
        <div>
          <p className="text-13 font-semibold text-ink">Electrical tool</p>
          <p className="mt-[2px] font-mono text-10 text-muted">pick · point · click</p>
        </div>
      </div>
      <Section title="Fixture" className="pb-[18px]">
        <div role="radiogroup" aria-label="Fixture" className="grid grid-cols-3 gap-[6px]">
          {FIXTURE_KINDS.map((k, i) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={es.kind === k}
              onClick={() => es.setKind(k)}
              className={cn(
                'relative flex h-[70px] flex-col items-center rounded-[3px] border border-line bg-sunken pt-[6px]',
                es.kind === k && 'border-accent bg-accent-tint',
              )}
            >
              <span className="absolute top-[3px] right-[5px] font-mono text-9 text-faint">{i + 1}</span>
              <FixtureThumb kind={k} color={color} width={56} height={34} />
              <span className="mt-[3px] text-10 font-medium text-ink">{FIXTURES[k].name}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-11 leading-[15px] text-muted">
          {spec.onWall
            ? es.kind === 'switch'
              ? 'Snaps to the nearest wall face, slides along it in 5 cm steps, and stays clear of doors and windows.'
              : 'Snaps to the nearest wall face, slides along it in 5 cm steps, and stays out of doorways (under a window is fine).'
            : `Goes where you click${store.snap.grid ? `, on the ${gridLabel(store.snap.gridStep)} grid` : ''}.`}
        </p>
      </Section>
      <Section title="Circuit" className="pb-[18px]">
        {spec.wired ? (
          <>
            <CircuitChips
              circuits={circuitsOf(store.doc)}
              value={es.circuit}
              onChange={(id) => es.setCircuit(id)}
              onNew={() => es.newCircuit()}
            />
            <p className="mt-2 text-11 leading-[15px] text-muted">
              New switches and lights join this circuit; a dashed wire runs from each switch to its lights.
            </p>
          </>
        ) : (
          <p className="text-11 leading-[15px] text-muted">
            Outlets aren&apos;t switched: circuits wire switches to lights.
          </p>
        )}
      </Section>
      <div className="m-4 rounded-[4px] border border-line bg-sunken px-3 pt-[9px] pb-[10px]">
        <p className="font-mono text-9 font-medium tracking-label-sm text-muted uppercase">Shortcuts</p>
        <div className="mt-2 grid grid-cols-[64px_1fr] gap-y-1 font-mono text-10">
          {SHORTCUTS.map(([key, what]) => (
            <span key={key} className="contents">
              <span className="text-ink">{key}</span>
              <span className="text-muted">{what}</span>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

/** Properties of a selected switch or light: rewire it to another circuit (one SetCircuit). */
export function CircuitSection({ f }: { f: Furniture }) {
  const store = useEditor();
  const set = (id: string | null) => {
    const next: Furniture = { ...f };
    if (id) next.circuit = id;
    else delete next.circuit;
    store.editObjects('SetCircuit', [next]);
  };
  return (
    <Section title="Circuit" className="pb-[16px]">
      <CircuitChips
        circuits={circuitsOf(store.doc)}
        value={f.circuit ?? null}
        onChange={set}
        onNew={() => set(nextCircuitId(store.doc))}
      />
    </Section>
  );
}
