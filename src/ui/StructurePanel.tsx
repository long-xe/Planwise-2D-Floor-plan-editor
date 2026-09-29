import type { Opening, SceneObject, Wall } from '../core/document';
import { findObject } from '../core/document';
import { wallWithOpenings } from '../core/editActions';
import { hostWall, kindName, objectLabel, wallLength } from '../core/structure';
import { fitOpening, moveWallEnd, setWallLength } from '../core/structureEdit';
import { NumberField, Section, TextButton } from './controls';
import { ItemGlyph } from './itemIcons';
import { LayerSection } from './LayerSection';
import { useEditor } from './useStore';

const m = (v: number) => v.toFixed(2);

function WallFields({ w }: { w: Wall }) {
  const store = useEditor();
  // Re-seat the wall's doors and windows whenever its shape changes.
  const set = (type: string, next: Wall) => store.editObjects(type, wallWithOpenings(store.doc, w, next));
  const end = (e: 'a' | 'b', p: { x: number; y: number }) => set('ResizeWall', moveWallEnd(w, e, p));
  return (
    <div className="grid grid-cols-2 gap-2">
      <NumberField label="L" unit="m" value={wallLength(w)} onCommit={(v) => set('ResizeWall', setWallLength(w, v))} />
      <NumberField
        label="T"
        unit="m"
        value={w.thickness}
        onCommit={(v) => set('EditWall', { ...w, thickness: Math.max(0.05, v) })}
      />
      <NumberField label="X" unit="m" value={w.a.x} onCommit={(x) => end('a', { ...w.a, x })} />
      <NumberField label="Y" unit="m" value={w.a.y} onCommit={(y) => end('a', { ...w.a, y })} />
      <NumberField label="X" unit="m" value={w.b.x} onCommit={(x) => end('b', { ...w.b, x })} />
      <NumberField label="Y" unit="m" value={w.b.y} onCommit={(y) => end('b', { ...w.b, y })} />
    </div>
  );
}

function OpeningFields({ o, host }: { o: Opening; host: Wall }) {
  const store = useEditor();
  const set = (type: string, next: Opening) => store.editObjects(type, [fitOpening(next, host)]);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="W" unit="m" value={o.width} onCommit={(width) => set('ResizeOpening', { ...o, width })} />
        <NumberField label="O" unit="m" value={o.offset} onCommit={(offset) => set('MoveOpening', { ...o, offset })} />
      </div>
      <p className="mt-2 font-mono text-10 text-muted">
        in {kindName(host).toLowerCase()} {host.id} · {m(wallLength(host))} m
      </p>
      {o.type === 'door' && (
        <div className="mt-3 flex gap-1">
          <TextButton
            className="h-[30px] flex-1"
            onClick={() => set('EditOpening', { ...o, hinge: o.hinge === 'end' ? 'start' : 'end' })}
          >
            Flip hinge
          </TextButton>
          <TextButton
            className="h-[30px] flex-1"
            onClick={() => set('EditOpening', { ...o, swing: o.swing === -1 ? 1 : -1 })}
          >
            Flip swing
          </TextButton>
        </div>
      )}
    </>
  );
}

/**
 * Right panel for walls, doors and windows (Walls layer). Fields edit
 * through commands (undoable); on canvas, drag to move and drag the end /
 * jamb handles to resize. Mitred joins with neighbouring walls come with
 * Draw Walls (04).
 */
export function StructurePanel({ ids }: { ids: string[] }) {
  const store = useEditor();
  const objects = ids.map((id) => findObject(store.doc, id)).filter((o): o is SceneObject => !!o);
  const one = objects.length === 1 ? objects[0]! : null;
  const host = one?.kind === 'opening' ? hostWall(store.doc, one) : undefined;
  const glyph = one?.kind === 'wall' ? 'wall' : one?.kind === 'opening' ? one.type : 'wall';
  return (
    <>
      <div className="flex h-16 shrink-0 items-start gap-[10px] border-b border-line px-4 pt-[15px]">
        <span className="flex size-9 items-center justify-center rounded-[3px] border border-line bg-sunken">
          <ItemGlyph icon={glyph} className="text-ink" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-13 font-semibold text-ink">
            {one ? objectLabel(one) : `${objects.length} pieces selected`}
          </p>
          <p className="mt-[2px] font-mono text-10 text-muted">
            {one ? one.id : 'walls · doors · windows'} · {store.layerName(objects[0]?.layerId ?? 'walls')} layer
          </p>
        </div>
      </div>
      {one?.kind === 'wall' && (
        <Section title="Wall">
          <WallFields w={one} />
          <p className="mt-2 font-mono text-10 text-muted">L length · T thickness · start X/Y · end X/Y</p>
        </Section>
      )}
      {one?.kind === 'opening' && (
        <Section title={one.type === 'door' ? 'Door' : 'Window'}>
          {host && <OpeningFields o={one} host={host} />}
        </Section>
      )}
      <LayerSection ids={ids} />
      <Section title="Edit">
        <p className="text-11 leading-[15px] text-muted">
          Drag to move; drag an end or a jamb to resize. Walls joined to it stretch along and its outlets follow.
          Deleting a wall removes its doors and windows too (⌘Z restores both).
        </p>
        <TextButton danger className="mt-3 h-8 w-full" onClick={() => store.deleteSelection()}>
          Delete
        </TextButton>
      </Section>
    </>
  );
}
