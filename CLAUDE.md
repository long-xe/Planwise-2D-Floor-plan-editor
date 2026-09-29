# CLAUDE.md

## Project

**Planwise**: an interactive floor plan editor built entirely on the **raw Canvas 2D API** (no Fabric/Konva/Pixi). It demonstrates low-level control over rendering, hit detection, and input handling.

Users draw walls, cut doors and windows, place furniture and electrical fixtures, and annotate the plan on a zoomable, pannable canvas with snapping, layers, and a single global undo/redo stack.

**Status:** all P1 and P2 screens are built. Of P3, only 03 New Plan Setup exists, as a modal opened from the Planwise logo menu. 01 Landing and 02 Plans Dashboard were dropped on purpose: the demo is the editor. Several features go beyond the design (see "Built beyond the design").

**Stack:** React 19, TypeScript (strict), Canvas 2D API, Vite, Tailwind v4 (tokens in `src/ui/tokens.css`), Vitest, oxlint, Prettier. Package manager: **yarn** (Vercel deploys with yarn; `vercel.json`).

**Approved runtime dependencies** (ask before adding any other): `@dnd-kit/*` (layer reorder), `clsx` + `tailwind-merge` (`ui/cn.ts`), `jspdf` + `svg2pdf.js` (vector PDF export, lazy-loaded). Rendering itself uses no library.

**Design source of truth:** Figma file `5t0O5yYDTlxuXsnjGYFRWO` ("2D-3D Project Designs", https://www.figma.com/design/5t0O5yYDTlxuXsnjGYFRWO/2D-3D-Project-Designs?node-id=2-2), page `02 · Planwise — Floor Plan Editor` (node `2:2`). Before building or changing a screen, fetch its design context with the Figma MCP using the node id below. Do not invent colors, spacing, or copy that the design already defines.

If the Figma MCP is rate-limited, use the Figma REST API with `FIGMA_ACCESS_TOKEN` (set in `.claude/settings.local.json`, never committed): `GET https://api.figma.com/v1/files/5t0O5yYDTlxuXsnjGYFRWO/nodes?ids=<node>` and `/v1/images/...` with header `X-Figma-Token`. Never print, echo or commit the token; send it only to api.figma.com.

## Design screens (Figma node ids)

| # | Screen | Node | Priority | Status |
|---|---|---|---|---|
| 04 | Editor: Draw Walls | `17:2` | P1 | Done |
| 05 | Editor: Furniture Library | `19:2` | P1 | Done (+ Electrical section) |
| 06 | Editor: Transform & Snap | `13:288` | P1 | Done |
| 07 | Editor: Multi-select & Hit Detection | `20:641` | P1 | Done |
| 08 | Layers Manager | `22:372` | P1 | Done |
| 09 | History / Command Stack | `24:270` | P1 | Done |
| 11 | Performance Debug Overlay | `29:576` | P1 | Done |
| 10 | Annotations & Measurements | `28:2` | P2 | Done |
| 12 | Export & Print | `37:2` | P2 | Done |
| 01 | Landing Page | `30:2` | P3 | Dropped |
| 02 | Plans Dashboard | `32:2` | P3 | Dropped |
| 03 | New Plan Setup | `35:2` | P3 | Done as a modal (logo menu → New plan…) |

The design has no content for the right panel's **Document** tab and no tooltip, Revision-cloud tool or Electrical tool. Those were built from existing components and tokens (Tool hint bar, panel Sections).

## Editor layout (as built, 1440x900, min width 1200)

- **Topbar (52px):** logo menu (New plan…, Import project…, Open demo (asks first), Open stress plan · Northgate, Export & print…), breadcrumb `Plans / <plan name>` (click the name to rename), save status (autosave), undo/redo, zoom (- 100% +), avatars, Share, Export, gear. Avatars, Share and the gear are decorative.
- **Left tool rail** (every button has a tooltip with name, key and how-to):
  - select `V`, hand `H`
  - wall `W`, door `D`, window `O`, furniture `F`, electrical `E`
  - text `T` (Label / Room name), dimension `L`, measure `M`, note `N` (Note / Callout), revision cloud `R`
  - bottom: grid (show + grid size popover), snap to grid (magnet), Perf HUD (bug, `F12`)
- **Left panel tabs:** Layers, Library (furniture + Electrical), History. The Measure tool adds the area schedule and measure cards.
- **Canvas:** rulers (m), adaptive grid, north arrow, scale bar, dimension chains, room labels with area, title block (with the Annotations layer), tool hint bar per drawing tool.
- **Right panel tabs:** Properties, Document (+ Performance while the HUD is on). Properties changes per tool and selection: furniture, walls/openings, annotations, multi-select, layer, tool panels, history inspector.
- **Status bar:** cursor X/Y, zoom, objects, selected, FPS, frame time, `Canvas 2D · rAF loop`; changes per tool/HUD.

## Architecture rules

1. **Document model lives outside React.** `core/store.ts` (`EditorStore extends StoreFeeds`) holds doc, selection, viewport, snap, tool state. React subscribes via `useSyncExternalStore`. Fast-changing values (frame stats, hover picks, wall draft, furniture ghost, measure draft) have their own channels so panels don't re-render per frame. The render loop polls `store.dirty` and never depends on React.
2. **World units are metres.** Convert world <-> screen in `core/viewport.ts`. Never store pixels in the document. Known exceptions: `Appearance.strokeWidth` (a line weight) and `TextAnnotation.size` (px). Note/callout boxes are positioned in metres and sized in px at draw time (`core/annotationLayout.ts`).
3. **One command stack for everything.** Every document mutation goes through a `Command` (`core/commands.ts`, `structureCommands.ts`, `layerCommands.ts`, `docCommands.ts`). UI and tools build edited copies and call `store.editObjects(type, next)` or a store action. The only direct write is restoring a saved project on load.
4. **Transactions.** One pointer drag = one command (`stack.begin()` → `tx.update()` preview → `commit()` on pointer up). Esc, lost focus, pointercancel and **switching tools** roll back. `CanvasView` cancels the previous tool when `tools.active` changes.
5. **Coalescing.** Consecutive commands of the same type on the same ids merge within 300 ms (History option on/off; the window itself is fixed).
6. **Tools are state machines** behind `tools/Tool.ts`. Tool-specific state that must die on a tool switch lives in `ToolState` sub-states (`place`, `measure`, `furniture`, `electrical`, `annotation`), which `setActive` resets. Adding a tool still means adding its id to the `ToolId` union and the tools map in `App.tsx`.
7. **Layers enforce rules at the model level:** commands on locked/hidden layers are refused (`canExecute`). Hidden and locked layers are skipped by picking; hidden ones by rendering. `EditObjectsCommand` also refuses a target layer that is locked or hidden (Move to layer).
8. **Batch commands.** Group operations (align, distribute, furniture+wall moves) are one entry with child commands, shown as a tree in History.
9. **Keys:** `CanvasView` routes keys in this order: modal open → ignore; F12; text inputs → ignore; ⌘-shortcuts; **`tool.ownsKey(e)`** (tool keeps its keys, e.g. Furniture `R`, Wall/Revision Enter/Esc/Backspace); tool shortcut letters; Delete; Space-pan; `tool.onKey`.

## Folder structure

```
src/
  core/        # pure TS, no DOM
    document.ts          # Doc, Layer, Wall, Opening, Furniture (incl. fixtures), SheetInfo
    annotations.ts       # Annotation union, units/precision formatting
    store.ts, storeFeeds.ts, storeTypes.ts, channel.ts   # EditorStore + change feeds
    commandStack.ts, commands.ts, structureCommands.ts, layerCommands.ts, docCommands.ts
    commandCodec.ts, persistence.ts, historyController.ts, historyView.ts, historyPayload.ts
    toolState.ts + placeState.ts, measureState.ts, furnitureState.ts, electricalState.ts, annotationState.ts
    picking.ts, spatialIndex.ts, selection.ts, align.ts, snapping.ts, wallSnap.ts, measureSnap.ts
    placement.ts (furniture rules), openingPlace.ts, fixturePlace.ts, circuits.ts
    structure.ts, structureEdit.ts, wallFollow.ts (joined walls + mounted fixtures follow)
    roomDetect.ts (flood-fill rooms from walls), roomLabels.ts, rooms.ts (roomOf from labels)
    annotationLayout.ts, annotationEdit.ts, layerStats.ts, layerRows.ts, perf.ts, perfState.ts, export*.ts
  geometry/    # hitTest, transform, walls (graph, mitre, T), openings, clearance, vec
  render/      # renderLoop, contentPass, dirtyRects, cullIndex, layerCache, batchDraw, drawScene,
               # drawFurniture (fixtures + circuit wires), drawAnnotations, overlay + *Overlay.ts, sheet, titleBlock
  tools/       # Tool.ts, Select, Transform, Structure, Hand, Wall, Opening, Furniture, Electrical,
               # Text (label/room), Dimension (+ chain), Measure, Revision; annotationDrag, structureMove
  export/      # vectorContext → SVG, pdfDoc (jsPDF + svg2pdf, IBM Plex TTFs in public/fonts), runExport
  library/     # catalog*, demoScene (Harbor St.), demoAnnotations, electrical (fixture specs), officeScene
               # (Northgate stress plan, ?plan=northgate), templates (New plan), rooms (demo only), wallNames
  ui/          # React panels; tokens.css; controls.tsx (Section, NumberField, TextField, Toggle, …)
  tests/       # Vitest suites, one per feature area
```

## Key interfaces

```ts
interface Tool {
  id: string;
  cursor: string;
  onPointerDown(e: ToolPointerEvent, ctx: ToolContext): void;
  onPointerMove(e: ToolPointerEvent, ctx: ToolContext): void;
  onPointerUp(e: ToolPointerEvent, ctx: ToolContext): void;
  onPointerLeave?(ctx: ToolContext): void;          // drop previews
  onKey?(e: KeyboardEvent, ctx: ToolContext): void; // keydown (and Shift keyup)
  onDoubleClick?(e: ToolPointerEvent, ctx: ToolContext): void;
  ownsKey?(e: KeyboardEvent, ctx: ToolContext): boolean; // wins over tool shortcuts
  cancel(ctx: ToolContext): void;                   // rollback / drop previews
}

interface Command {
  type: string;                 // "Rotate", "PlaceFurniture", "MoveToLayer", "RenamePlan", ...
  ts: number;
  describe(): string;
  canExecute?(doc: Doc): boolean;
  execute(doc: Doc): void;
  undo(doc: Doc): void;
  merge?(next: Command): boolean;
  children?: Command[];         // batch
}
```

`Layer` fields: id, name, color, visible, locked, opacity, order, includeInPrint, snapTargets, cacheAsStatic.

Default layers: `Annotations`, `Furniture`, `Walls`, `Grid & guides`. The demo adds `Electrical`, and plans without it create it on the first fixture (same undo step, `AddObjectsCommand.layers`). Every new command class must be registered in `core/commandCodec.ts` (persisted history) and given a row in `historyView.ts` / `historyPayload.ts`.

## Feature specs (from the design)

**Draw Walls (04):** chain mode; click adds a point, Shift = free angle, Enter closes, Esc finishes, Backspace removes the last point. Angle snap, snap to grid (20 cm), snap to endpoints (12 px). Thickness 0.16 m, height 2.70 m, alignment Center/Inside/Outside. Mitred corners, T-junctions. Live length/angle label, wall graph summary.

**Furniture Library (05):** searchable catalog (`⌘K`), categories (Living, Bedroom, Kitchen, Bath, Office), footprint sizes. Drag → ghost with drop preview, aligned-to hint, collision status → one `PlaceFurniture`. Placement rules: snap back to wall, keep 0.60 m walkway, auto-rotate to nearest wall.

**Transform & Snap (06):** handles, rotation with angle snap (5/15/45/90°), live dimension labels, X/Y/W/H/R fields, lock aspect ratio, flip. Snap toggles: grid, walls, smart guides, objects; tolerance in px. Appearance: fill, stroke, stroke width.

**Multi-select & Hit Detection (07):** shift+click, marquee Intersect / Contain (Alt), Align, Distribute, Group `⌘G`, Duplicate, Delete. Hit pipeline: spatial hash (2 m cells) → bbox → even-odd point-in-polygon. Debug: hit regions, broadphase grid, log timings. L-sofa crook selects what's underneath.

**Layers Manager (08):** drag to reorder, visibility, lock, opacity, rename, color, counts, cache as static bitmap. `ReorderLayer`, `ToggleLayer` etc. are undoable.

**History (09):** global stack (limit 200), HEAD, greyed redo, jump to entry, expandable batches. Options: merge drags within 300 ms, persist history (localStorage autosave), branch on edit after undo. Depth, memory, coalesced count, payload inspector. `⌘Z`, `⌘⇧Z`, `⌘⌥Z` jump.

**Performance (11):** HUD on `F12`, frame breakdown, frame graph, renderer switches (static cache, dirty rects, culling, batching, show dirty regions). Stress plan Northgate: 842 objects (`?plan=northgate`).

**Annotations & Measurements (10):** dimension chains, Measure tool (Enter keeps a dimension), callouts, notes, revision clouds, room area labels, title block, area schedule, units metric/imperial + precision.

**Export & Print (12):** PNG (300 dpi), vector PDF, SVG, JSON project file; paper, orientation, scale 1:20/50/100/fit, layers, sheet elements; print via hidden iframe. Runs on the main thread into an OffscreenCanvas (not a Worker).

## Built beyond the design (keep them working)

- **Door / Window tools:** snap to the nearest wall; preview with a leaf and swing arc; Shift flips the hinge. Refused when the wall is too short or overlaps another opening.
- **Electrical tool + Library section:** outlets and switches mount on wall faces (5 cm steps, out of doorways; switches also out of windows); ceiling lights go on the grid. Circuits C1…Cn with dashed wires; `CircuitSection` rewires a selected switch/light. Keys 1/2/3 pick the fixture.
- **Annotation editing (Select tool):** notes, callouts, text, room names, revision clouds and dimension runs are picked on screen (`annotationLayout.ts`). Drag moves the piece grabbed; double-click edits the words inline; Delete deletes. With a room focused, Delete removes only that room.
- **Text tool Room mode:** hover finds the closed room from the walls (2 cm flood fill, exact on cm-aligned faces) and shows its net area. Click names it: the name joins the area annotation and the schedule. A room that already has a name is renamed instead.
- **Note tool Callout mode:** pin + boxed title + one line of detail.
- **Dimension chains:** after placing a dimension, clicks extend it along the same line (`ExtendDimension`) until Enter/Esc. Toggle "Continue as chain".
- **Revision cloud tool:** Rectangle or Points mode; Δ number auto-increments; "what changed" typed at the tag.
- **Walls follow walls:** moving or resizing a wall stretches walls cornered/T'd onto it and re-seats their openings. Outlets/switches ride with a wall moved whole, and stay put on a wall that only stretches.
- **Selection extras:** Ungroup `⇧⌘G`, Flip vertical, Move to layer (Properties → Layer; openings stay with their wall).
- **Document tab:** plan name, title block fields (undoable `EditSheet`, "Set Rev N" from the newest cloud), units & precision, area schedule. The plan can also be renamed from the breadcrumb (`RenamePlan`).
- **Rail tooltips; chip-row horizontal scrolling** in the Library (wheel, arrows, fades).

## Decisions and assumptions (don't "fix" these without asking)

- Wall angle snap defaults to 0/45/90° (from the Figma panel), though the text spec says 15°. 15° is available as a toggle.
- Collision and the 0.60 m walkway are warnings only; auto-rotate is off by default.
- "Persist history in file" toggles the whole localStorage autosave. The JSON export always includes history.
- Export layer checkboxes start from each layer's `includeInPrint` and are per-export overrides (reset on open). The demo and templates don't print Electrical or the grid by default.
- Vertical flip is stored as `flipX` toggled + rotation +180° (same pixels, one flip flag). The Flip-vertical button replaced the duplicate lock-aspect icon button (the checkbox remains).
- Room tags on furniture and fixtures, and names of new walls, come from the plan's own room labels (`core/rooms.ts#roomOf`). `library/rooms.ts` is demo-build data only.
- Living + Kitchen in the demo are one open-plan space for room detection (the wall between them has a gap).
- Units & precision are an editor setting (not saved in the project file).
- Note author is `MR`, the demo's signed-in user.
- Keyboard: `R` = Revision cloud except in the Furniture tool (turns the ghost). `D` = Door, so Duplicate has no shortcut.

## Known gaps / backlog

- Decorative: Share, avatars, gear (no dark theme exists), "Plans /" crumb.
- No ⌘D / copy-paste / arrow nudge / select all / zoom keys; no flip for multi-select; marquee doesn't select annotations.
- Room labels don't follow wall edits. No room tool for areas beyond clicking a closed room.
- Wall height is stored but unused; existing walls can't change height/alignment.
- Export runs on the main thread. Units & precision are not saved in the project file.
- Renderer: only furniture is culled and dirty-rect redrawn; some allocations per drawn frame; no DPR change listener without resize.
- `export/vectorContext.ts` is 301 lines.

## Rendering rules

- `requestAnimationFrame` loop; redraw only when dirty. Two canvases: content (dirty rects, full repaint when `viewKey` changes: pan, zoom, size, DPR, layers incl. color, render options, units, grid step) and overlay (redrawn every drawn frame).
- Static layers (locked or "cache as static") cached in an OffscreenCanvas keyed by `layerSignature` (geometry + style + circuits) and the view.
- Viewport culling with a 4 m spatial hash; symbol batching per style.
- Handle `devicePixelRatio`. Avoid allocations inside the loop.
- Expose frame timing and counters to the status bar and Perf HUD.

## Coding standards

- TypeScript strict, `noUncheckedIndexedAccess`, no `any`. Geometry and command code are pure and unit-testable (no DOM/canvas).
- No new runtime dependencies without asking. Dev dependencies for testing are fine.
- Files under ~300 lines. Comments explain *why*.
- **UI must match the Figma design.** Reuse tokens via CSS variables in `ui/tokens.css`; do not hardcode colors in components (layer colors are document data and may be inline). SVG icons use `?react` with `currentColor` (see `vite.config.ts` `replaceAttrValues`).
- Do not refactor unrelated code or add features not asked for.
- Browser checks (puppeteer-core against `npx vite --port 5199 --strictPort`) and their screenshots live outside the repo: never write screenshots or scripts into the project root.

## Testing

Suites in `src/tests/` cover commands/undo/redo, transactions and coalescing, batches, hit testing (L-sofa crook, rotated, marquee), layers, walls (mitre, T, angle snap), viewport round trip, perf scene size, placement, openings, export layout, annotations, measure, New plan, place tools, revision tool, electrical, annotation editing, wall follow and the fixes/feature suites (`fixes.test.ts`, `group2.test.ts`).

Commands: `yarn dev`, `yarn test`, `yarn typecheck`, `yarn lint`, `yarn format:check`, `yarn build` (npm run works too).

## Working process

- Before coding: fetch the Figma node when a designed screen is involved, state a short plan (files to add/change), implement, then run typecheck, lint, format check, tests and build.
- Check UI changes in a real browser as well as with unit tests.
- If ambiguous, choose the simplest option consistent with these rules and note the assumption (add lasting ones to "Decisions and assumptions").
- Keep the app runnable after every change. Do not commit unless asked.

## Definition of done (per task)

- Typecheck, lint and format clean; tests pass; build succeeds.
- Matches the Figma screen (layout, tokens, copy) for the UI involved.
- Works with undo/redo, including redo after undo.
- No document mutation outside commands.
- Smooth on the demo scene and on the 842-object Northgate plan.
