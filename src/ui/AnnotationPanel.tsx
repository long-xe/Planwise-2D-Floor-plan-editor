import type { ReactNode } from 'react';
import { type Annotation, formatArea, formatLength, polygonArea } from '../core/annotations';
import { samePart } from '../core/annotationLayout';
import { cn } from './cn';
import { NumberField, Section, TextButton, TextField } from './controls';
import { ItemGlyph } from './itemIcons';
import { MonoSegments } from './MonoSegments';
import { LayerSection } from './LayerSection';
import { useEditor } from './useStore';

const KIND: Record<Annotation['type'], string> = {
  dimension: 'Dimension',
  area: 'Room labels',
  callout: 'Callout',
  note: 'Note',
  revision: 'Revision cloud',
  text: 'Text',
};

function Label({ children, first }: { children: ReactNode; first?: boolean }) {
  return <p className={cn('text-12 text-muted', !first && 'mt-3')}>{children}</p>;
}

/** The fields for one annotation's words and numbers; every change is one undoable command. */
function Fields({ a }: { a: Annotation }) {
  const store = useEditor();
  const ann = store.tools.annotation;
  const edit = (next: Annotation, type = 'EditAnnotation') => store.editObjects(type, [next]);
  const format = store.tools.measure.style.format;
  switch (a.type) {
    case 'note':
      return (
        <>
          <Label first>Text</Label>
          <TextField
            className="mt-1"
            multiline
            label="Note text"
            value={a.text}
            onCommit={(text) => edit({ ...a, text })}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <TextField label="Author" value={a.author} onCommit={(author) => edit({ ...a, author: author.trim() })} />
            <TextField label="Date" value={a.date} onCommit={(date) => edit({ ...a, date: date.trim() })} />
          </div>
        </>
      );
    case 'callout':
      return (
        <>
          <Label first>Title</Label>
          <TextField
            className="mt-1"
            label="Callout title"
            value={a.title}
            onCommit={(title) => edit({ ...a, title: title.trim(), name: `Callout · ${title.trim()}` })}
          />
          <Label>Body</Label>
          <TextField
            className="mt-1"
            label="Callout body"
            value={a.body}
            onCommit={(body) => edit({ ...a, body: body.trim() })}
          />
        </>
      );
    case 'text':
      return (
        <>
          <Label first>Text</Label>
          <TextField
            className="mt-1"
            label="Label text"
            value={a.text}
            onCommit={(text) => edit({ ...a, text: text.trim() })}
          />
          <Label>Size</Label>
          <MonoSegments
            className="mt-1"
            options={[11, 13, 16, 20].map((px) => ({ id: px, label: `${px} px` }))}
            value={a.size}
            onChange={(size) => edit({ ...a, size })}
          />
        </>
      );
    case 'area': {
      const focus = ann.focusedPart(a.id);
      return (
        <div className="flex flex-col gap-[6px]">
          {a.rooms.map((room, index) => {
            const part = { kind: 'room' as const, index };
            const on = !!focus && samePart(focus, part);
            return (
              <div
                key={index}
                className={cn('flex items-center gap-2 rounded-[3px] p-[2px]', on && 'ring-1 ring-accent')}
              >
                <TextField
                  className="flex-1"
                  label={`Room ${index + 1} name`}
                  value={room.name}
                  onFocus={() => !on && ann.setFocus({ id: a.id, part })}
                  onCommit={(name) =>
                    edit(
                      { ...a, rooms: a.rooms.map((r, i) => (i === index ? { ...r, name: name.trim() } : r)) },
                      'RenameRoom',
                    )
                  }
                />
                <span className="w-[64px] text-right font-mono text-10 text-muted">
                  {formatArea(polygonArea(room.polygon), format)}
                </span>
              </div>
            );
          })}
        </div>
      );
    }
    case 'revision':
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Δ"
              unit=""
              digits={0}
              value={a.rev}
              onCommit={(rev) => edit({ ...a, rev: Math.max(1, Math.round(rev)) })}
            />
          </div>
          <Label>What changed</Label>
          <TextField
            className="mt-1"
            label="Revision note"
            value={a.text}
            onCommit={(text) => edit({ ...a, text: text.trim() })}
          />
        </>
      );
    case 'dimension':
      return (
        <div className="flex flex-col gap-2">
          {a.runs.map((run, index) => {
            const [p, q] = [run.points[0]!, run.points.at(-1)!];
            return (
              <div key={index} className="grid grid-cols-2 items-center gap-2">
                <span className="font-mono text-10 text-muted">
                  Run {index + 1} · {formatLength(Math.hypot(q.x - p.x, q.y - p.y), format)}
                </span>
                <NumberField
                  label="O"
                  unit="m"
                  value={run.offset}
                  onCommit={(offset) =>
                    edit({ ...a, runs: a.runs.map((r, i) => (i === index ? { ...r, offset } : r)) })
                  }
                />
              </div>
            );
          })}
        </div>
      );
  }
}

const HOW: Record<Annotation['type'], string> = {
  note: 'Drag the box or its pin to move them. Double-click the box to edit the text.',
  callout: 'Drag the box or its dot to move them. Double-click: first line title, second line body.',
  text: 'Drag to move. Double-click to edit the words.',
  area: 'Drag a room name to move it inside its room. Double-click it to rename.',
  revision: 'Drag the Δ tag to move it, or the cloud’s edge to move both. Double-click the tag to edit.',
  dimension: 'Drag the dimension line to pull it closer or further; its ends stay on what it measures.',
};

/** Right panel for a selected annotation: its words, how to move it, and Delete. */
export function AnnotationPanel({ a }: { a: Annotation }) {
  const store = useEditor();
  const ann = store.tools.annotation;
  const focus = ann.focusedPart(a.id);
  const room = a.type === 'area' && focus?.kind === 'room' && a.rooms.length > 1 ? a.rooms[focus.index] : undefined;
  return (
    <>
      <div className="flex h-16 shrink-0 items-start gap-[10px] border-b border-line px-4 pt-[15px]">
        <span className="flex size-9 items-center justify-center rounded-[3px] border border-line bg-sunken">
          <ItemGlyph icon={a.type} className="text-ink" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-13 font-semibold text-ink">{a.name}</p>
          <p className="mt-[2px] font-mono text-10 text-muted">
            {a.id} · {store.layerName(a.layerId)} layer
          </p>
        </div>
      </div>
      <Section title={KIND[a.type]} className="pb-[18px]">
        <Fields a={a} />
      </Section>
      <LayerSection ids={[a.id]} />
      <Section title="Edit">
        <p className="text-11 leading-[15px] text-muted">{HOW[a.type]} ⌘Z undoes any change.</p>
        <div className="mt-3 flex gap-1">
          {room && (
            <TextButton danger className="h-8 flex-1" onClick={() => store.deleteSelection()}>
              Delete “{room.name}”
            </TextButton>
          )}
          <TextButton
            danger
            className="h-8 flex-1"
            onClick={() => {
              // With a room focused, Delete would take only that room.
              if (focus) ann.setFocus(null);
              store.deleteSelection();
            }}
          >
            {room ? 'Delete all rooms' : 'Delete'}
          </TextButton>
        </div>
      </Section>
    </>
  );
}
