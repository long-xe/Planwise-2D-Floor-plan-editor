import { useEffect, useRef, useState } from 'react';
import { cn } from './cn';
import { Icon } from './Icon';
import { useEditor } from './useStore';
import { importProject, isStressPlan, useWorkspace } from './workspace';
import logoMark from './icons/logo-mark.svg';
import logoDot from './icons/logo-dot.svg';
import chev from './icons/chev.svg';

type Action = 'new' | 'import' | 'demo' | 'stress' | 'export';

const GROUPS: { id: Action; label: string; hint?: string }[][] = [
  [
    { id: 'new', label: 'New plan…', hint: 'templates' },
    { id: 'import', label: 'Import project…', hint: '.json' },
  ],
  [
    { id: 'demo', label: 'Open demo · Harbor St. Residence' },
    { id: 'stress', label: 'Open stress plan · Northgate', hint: '842 obj' },
  ],
  [{ id: 'export', label: 'Export & print…', hint: 'PDF · PNG · SVG' }],
];

/**
 * The Planwise mark opens the app menu: start a new plan (design 03),
 * import a project file, jump between the demo plans, or export.
 */
export function LogoMenu() {
  const store = useEditor();
  const ws = useWorkspace();
  const [open, setOpen] = useState(false);
  /** "Open demo" asks first: it replaces the autosaved plan. */
  const [confirmDemo, setConfirmDemo] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  const choose = (id: Action) => {
    if (id === 'demo' && !confirmDemo) {
      setConfirmDemo(true);
      return;
    }
    setOpen(false);
    setConfirmDemo(false);
    if (id === 'new') ws.showNewPlan(true);
    else if (id === 'import') file.current?.click();
    else if (id === 'demo') ws.openDemo();
    else if (id === 'stress') {
      if (!isStressPlan()) window.location.assign('?plan=northgate');
    } else store.exporter.show(true);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setConfirmDemo(false);
        }}
        className={cn('-ml-1 flex items-center rounded-[4px] py-1 pr-2 pl-1 hover:bg-sunken', open && 'bg-sunken')}
      >
        <span className="relative size-6 rounded-[3px] bg-accent">
          <Icon src={logoMark} w={12} h={12} className="absolute top-[6px] left-[6px]" />
          <Icon src={logoDot} w={3} h={3} className="absolute top-[13.5px] left-[13.5px]" />
        </span>
        <span className="ml-2 text-16 font-bold text-ink">Planwise</span>
        <Icon src={chev} w={6} h={3} className="ml-2" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Planwise"
          className="absolute top-[38px] left-0 z-40 w-[288px] rounded-[4px] border border-line bg-surface py-1 shadow-float"
        >
          {GROUPS.map((items, g) => (
            <div key={g} className={cn(g > 0 && 'mt-1 border-t border-line pt-1')}>
              {items.map((it) =>
                it.id === 'demo' && confirmDemo ? (
                  <div
                    key={it.id}
                    role="alertdialog"
                    aria-label="Replace plan"
                    className="mx-2 my-1 rounded-[3px] bg-sunken px-3 py-2"
                  >
                    <p className="text-12 text-ink">Replace “{store.doc.name}” with the demo?</p>
                    <p className="mt-[2px] text-11 text-muted">The autosaved plan and its history are lost.</p>
                    <div className="mt-2 flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setConfirmDemo(false)}
                        className="h-7 rounded-[3px] border border-line bg-surface px-3 text-12 text-ink"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        autoFocus
                        onClick={() => choose('demo')}
                        className="h-7 rounded-[3px] bg-tool px-3 text-12 font-semibold text-surface"
                      >
                        Open demo
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    key={it.id}
                    type="button"
                    role="menuitem"
                    onClick={() => choose(it.id)}
                    className="flex h-8 w-full items-center px-3 text-left text-12 text-ink hover:bg-sunken focus:bg-sunken focus:outline-none"
                  >
                    <span className="flex-1">{it.label}</span>
                    {it.hint && <span className="font-mono text-10 text-muted">{it.hint}</span>}
                  </button>
                ),
              )}
            </div>
          ))}
        </div>
      )}
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importProject(f, ws);
        }}
      />
    </div>
  );
}
