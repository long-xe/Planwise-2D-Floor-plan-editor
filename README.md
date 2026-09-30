# Planwise — 2D Floor Plan Editor

An interactive floor plan editor built directly on the **raw Canvas 2D API**: no Fabric, Konva, Pixi or other scene-graph library. Rendering, hit detection, snapping and input handling are all implemented in the project, and every edit goes through one undo/redo command stack.

Draw walls, cut doors and windows, place furniture and electrical fixtures, annotate and measure the plan, then export it to a true-scale PDF, SVG or PNG. The editor stays smooth on an 842-object stress plan.

## Highlights

- **Walls:** chain drawing with angle, grid and endpoint snapping. Mitred corners and T-junctions are detected automatically. Moving or resizing a wall stretches the walls joined to it.
- **Doors and windows:** snap into walls, with a live swing preview.
- **Furniture library:** 29 catalog pieces (26 cards; the rest are size variants) with search (`⌘K`) and categories. Drag-and-drop with placement rules: snap back to the wall, keep a 0.60 m walkway, collision warnings.
- **Electrical:** outlets and switches mount on wall faces, and ceiling lights go on the grid. Switches wire to lights on circuits (C1…Cn), drawn as dashed wires you can rewire.
- **Transform and multi-select:** handles, rotation with angle snap, exact X/Y/W/H/R fields, flips, smart guides. Marquee selection in Intersect or Contain mode, align and distribute, group/ungroup.
- **Precise hit detection:** spatial hash, then bounding box, then even-odd point-in-polygon. Clicking the empty corner of an L-shaped sofa selects the rug underneath. Debug overlays show the whole pipeline.
- **Layers:** reorder, show/hide, lock, opacity, color, "cache as static bitmap", move objects between layers. The rules are enforced by the model, not the UI.
- **History:** a single global command stack (200 entries) with HEAD, jump-to-entry, expandable batches, coalescing, branch-on-edit and a payload inspector.
- **Annotations:** dimension chains, a live measure tool, notes, callouts, revision clouds, and room names whose **area is computed from the walls**. Also a title block, an area schedule, and metric/imperial units.
- **Export and print:** vector PDF and SVG at 1:20/1:50/1:100 or fit-to-page, PNG at 300 dpi, a JSON project file (history included), and direct printing.
- **Performance tools:** an F12 HUD with a frame breakdown, dirty-rect redraw, viewport culling, static layer caches and path batching, with switches to turn each technique on and off.
- **Persistence:** the project autosaves to the browser. New plans start from templates, and project files can be imported.

## Tech stack

| Area | Choice |
|---|---|
| UI shell | React 19 (panels, toolbars and dialogs only; the canvas never waits for React) |
| Language | TypeScript 7, `strict` + `noUncheckedIndexedAccess` |
| Rendering | Canvas 2D API, `requestAnimationFrame`, OffscreenCanvas layer caches |
| Build | Vite 8, `vite-plugin-svgr` (icons as `currentColor` components) |
| Styling | Tailwind CSS v4, design tokens in `src/ui/tokens.css`, IBM Plex Sans / Mono |
| Tests | Vitest (pure geometry, command, tool and store tests; no DOM needed) |
| Quality | oxlint, Prettier (+ Tailwind class ordering) |
| Runtime deps | `@dnd-kit/*` (layer reorder), `clsx` + `tailwind-merge`, `jspdf` + `svg2pdf.js` (lazy-loaded, PDF only) |
| Hosting | Vercel (static SPA) |

## Getting started

Requirements: Node.js 20.19+ or 22.12+ (Vite 8) and yarn.

```bash
yarn install
yarn dev            # http://localhost:5173
```

- The app opens on the demo plan **Harbor St. Residence — Unit 4B**.
- `http://localhost:5173/?plan=northgate` opens the 842-object stress plan with the Perf HUD on. It is not autosaved.
- The **Planwise** logo menu has New plan…, Import project…, Open demo, Open stress plan and Export & print.

## Scripts

```bash
yarn dev            # dev server
yarn test           # vitest run
yarn test:watch     # vitest in watch mode
yarn typecheck      # tsc --noEmit
yarn lint           # oxlint (TypeScript 7 has no JS API, so typescript-eslint can't run)
yarn format         # prettier --write (Tailwind class order included)
yarn format:check
yarn build          # typecheck + production build to dist/
yarn preview        # serve dist/
```

`npm run <script>` works as well. `yarn.lock` is the lockfile, and Vercel installs with `--frozen-lockfile`.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `V` `H` | Select, Hand |
| `W` `D` `O` `F` `E` | Wall, Door, Window, Furniture, Electrical |
| `T` `L` `M` `N` `R` | Text (label / room name), Dimension, Measure, Note (note / callout), Revision cloud |
| `Space` + drag, `⌘` + wheel | Pan, zoom |
| `⌘Z`, `⌘⇧Z`, `⌘⌥Z` | Undo, redo, jump to the entry inspected in History |
| `⌘G`, `⇧⌘G` | Group, ungroup |
| `⌘K` | Search the library |
| `Delete` / `Backspace` | Delete the selection |
| `Shift` | Free angle / add to selection / square box, depending on the tool |
| `Alt` + drag | Marquee "Contain"; drag without snapping |
| `Esc` | Cancel the current gesture, then back to Select |
| `F12` | Performance HUD |

Hover any tool on the left rail for its name, key and a one-line how-to.

## Project structure

```
src/
  core/       Document model, store, commands and history, tool state, picking,
              snapping, placement rules, walls, rooms, annotations, persistence (pure TS)
  geometry/   Vectors, transforms, hit testing, wall faces/joins, openings, clearance
  render/     rAF render loop, content pass, dirty rects, culling, layer cache,
              scene / furniture / annotation drawing, overlays, export sheet
  tools/      Tool state machines (Select, Transform, Wall, Door/Window, Furniture,
              Electrical, Text, Dimension, Measure, Revision, Hand, …)
  export/     Vector recorder → SVG, SVG → PDF (jsPDF + svg2pdf.js), download/print
  library/    Furniture catalog, fixture specs, demo and stress plans, New-plan templates
  ui/         React panels, toolbar, dialogs, controls, design tokens
  tests/      Vitest suites
public/fonts/ IBM Plex TTFs embedded into PDFs
docs/         Technical guide and demo video script
```

## How it works (in short)

1. **The document lives outside React.** `EditorStore` (plain TypeScript) holds the plan, the selection, the viewport and tool state. React panels subscribe to it, and the canvas render loop polls a `dirty` flag. No React render happens per frame.
2. **Every change is a command.** Tools and panels never mutate the document. They execute a `Command`, or open a transaction for a drag, which previews live and commits one history entry on pointer up. Locked and hidden layers refuse commands at the model level.
3. **Two canvases.** The content canvas repaints only what changed (dirty rects, culling, cached static layers, batched paths). The overlay canvas draws selection chrome, guides and previews above it.
4. **Units are metres.** World ↔ screen conversion happens in one place (`core/viewport.ts`).

The full walk-through of every module is in the [Technical guide](docs/technical-guide.md).

## Documentation

- [docs/technical-guide.md](docs/technical-guide.md): architecture, data flow and a module-by-module reference for `core`, `geometry`, `render`, `tools`, `export`, `library` and `ui`, plus recipes for extending the editor.
- [docs/demo-video-script.md](docs/demo-video-script.md): step-by-step flow for recording a client demo (Vietnamese).
- [CLAUDE.md](CLAUDE.md): project rules, design references (Figma), decisions and backlog.

## Design

The UI follows the Figma file *2D-3D Project Designs*, page `02 · Planwise — Floor Plan Editor`. Screens 04–12 (editor, library, transform, multi-select, layers, history, annotations, performance, export) and 03 (New plan, as a modal) are implemented. Landing and dashboard pages are out of scope.

## Browser support

Built and tested in recent Chrome. Any modern browser with OffscreenCanvas and Pointer Events should work. The heap readout in the Perf HUD uses Chrome's `performance.memory` and shows "n/a" elsewhere. Minimum window width is 1200 px. Touch input works with one finger; there is no pinch-zoom.

## Deploy (Vercel)

`vercel.json` configures the build (`yarn install --frozen-lockfile`, `npm run build` → `dist/`) and SPA rewrites. Import the repository on vercel.com, or run `npx vercel` / `npx vercel --prod`.
