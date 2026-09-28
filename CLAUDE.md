# CLAUDE.md

## Project

**Planwise**: an interactive floor plan editor built entirely on the **raw Canvas 2D API** (no Fabric/Konva/Pixi). It demonstrates low-level control over rendering, hit detection, and input handling.

Users place, move, rotate, and resize furniture and draw walls on a zoomable, pannable canvas with snapping, layers, and a single global undo/redo stack.

**Stack:** React, TypeScript (strict), Canvas 2D API, Vite, Vitest.

**Design source of truth:** Figma file `5t0O5yYDTlxuXsnjGYFRWO` ("2D-3D Project Designs", https://www.figma.com/design/5t0O5yYDTlxuXsnjGYFRWO/2D-3D-Project-Designs?node-id=2-2), page `02 · Planwise — Floor Plan Editor` (node `2:2`). Before building any screen, fetch its design context with the Figma MCP using the node id below. Do not invent colors, spacing, or copy that the design already defines.

If the Figma MCP is rate-limited, use the Figma REST API with `FIGMA_ACCESS_TOKEN` (set in `.claude/settings.local.json`, never committed): `GET https://api.figma.com/v1/files/5t0O5yYDTlxuXsnjGYFRWO/nodes?ids=<node>` and `/v1/images/...` with header `X-Figma-Token`.

## Design screens (Figma node ids)

| # | Screen | Node | Priority |
|---|---|---|---|
| 04 | Editor: Draw Walls | `17:2` | P1 |
| 05 | Editor: Furniture Library | `19:2` | P1 |
| 06 | Editor: Transform & Snap | `13:288` | P1 |
| 07 | Editor: Multi-select & Hit Detection | `20:641` | P1 |
| 08 | Layers Manager | `22:372` | P1 |
| 09 | History / Command Stack | `24:270` | P1 |
| 11 | Performance Debug Overlay | `29:576` | P1 |
| 10 | Annotations & Measurements | `28:2` | P2 |
| 12 | Export & Print | `37:2` | P2 |
| 01 | Landing Page | `30:2` | P3 |
| 02 | Plans Dashboard | `32:2` | P3 |
| 03 | New Plan Setup | `35:2` | P3 |

P1 screens are the core of the demo and map to the raw-Canvas story. P3 screens are marketing/shell; build only if time remains.

## Editor layout (from the design, 1440x900)

- **Topbar (52px):** logo, breadcrumb (`Plans / <plan name>`), save status, undo/redo, zoom (- 100% +), collaborator avatars, Share, Export, theme toggle.
- **Left tool rail:** select, hand, wall, arc/door, window, furniture, text, dimension, measure, note; bottom: grid, snap, theme.
- **Left panel tabs:** Layers, Library, History.
- **Canvas:** rulers (top and left, in metres), grid, north arrow, scale bar (`Scale 1:50`), on-canvas dimension chains and room labels with area.
- **Right panel tabs:** Properties, Document. Sections change per tool (Transform, Snapping, Appearance, Command).
- **Status bar:** cursor X/Y, zoom, object count, selected count, FPS, frame time, `Canvas 2D · rAF loop`.

## Architecture rules

1. **Document model lives outside React.** A pure TS store holds layers, objects, selection, viewport, and tool state. React renders only panels, toolbar, and status bar. The canvas render loop never depends on React re-renders.
2. **World units are metres.** The design shows all values in metres (`2.40 m`, walls `0.16 m` thick). Convert world <-> screen only in `core/viewport.ts`. Never store pixels in the document.
3. **One command stack for everything.** Every mutation goes through a `Command`: add wall, place furniture, move, rotate, resize, delete, batch align/distribute, toggle layer, reorder layer, add annotation. No direct mutation from tools or UI.
4. **Transactions.** One pointer drag = one command. A pending command is shown in the Properties "Command" section and commits on pointer up. Roll back on Esc or lost focus.
5. **Coalescing.** Merge continuous moves within 300 ms (configurable).
6. **Tools are state machines** behind a shared `Tool` interface. Adding a tool must not touch core code.
7. **Layers enforce rules at the model level:** locked layers reject edits, hidden layers are skipped by rendering and hit testing.
8. **Batch commands.** Group operations (align left, group selection) are one history entry with child commands, shown as a tree in the History panel.

## Folder structure (adjust to the real repo)

```
src/
  core/
    document.ts        # Document, Layer, SceneObject, Wall, Furniture, Annotation
    store.ts           # pure TS store, subscribe/notify
    commands.ts        # Command, CommandStack, transactions, batch, merge
    viewport.ts        # zoom/pan, world <-> screen (m <-> px), rulers
    snapping.ts        # grid, walls, endpoints, objects, smart guides, angle snap
    spatialIndex.ts    # uniform spatial hash (design uses 2 m cells for hit test)
  render/
    renderLoop.ts      # rAF loop, dirty flags, frame timing
    layerCache.ts      # OffscreenCanvas per layer, static cache for locked layers
    dirtyRects.ts      # dirty-rect redraw + viewport culling
    overlay.ts         # selection box, handles, snap guides, live measurements
  tools/
    Tool.ts
    SelectTool.ts      # click, shift-add, marquee (intersect / contain)
    WallTool.ts        # chain mode, angle snap, mitred joins, T-junctions
    FurnitureTool.ts   # drag from library, ghost preview, drop command
    TransformTool.ts   # move, rotate (angle snap), resize, lock aspect
    MeasureTool.ts
    AnnotationTool.ts  # dimension chains, callouts, notes
  geometry/
    hitTest.ts         # point-in-polygon (even-odd), bbox, marquee
    walls.ts           # wall graph, joins, mitre
    transform.ts
  library/             # furniture catalog (id, dims, footprint polygon)
  ui/                  # React: TopBar, ToolRail, LayersPanel, LibraryPanel,
                       # HistoryPanel, PropertiesPanel, StatusBar, PerfHUD
  tests/
```

## Key interfaces

```ts
interface Tool {
  id: string;
  cursor: string;
  onPointerDown(e: ToolPointerEvent, ctx: ToolContext): void;
  onPointerMove(e: ToolPointerEvent, ctx: ToolContext): void;
  onPointerUp(e: ToolPointerEvent, ctx: ToolContext): void;
  onKey?(e: KeyboardEvent, ctx: ToolContext): void;
  cancel(ctx: ToolContext): void;              // rollback open transaction
  renderOverlay?(g: CanvasRenderingContext2D, ctx: ToolContext): void;
}

// Matches the Command interface shown in the History screen.
interface Command {
  type: string;                                // "Rotate", "PlaceFurniture", ...
  execute(doc: Doc): void;
  undo(doc: Doc): void;
  merge?(next: Command): boolean;
  children?: Command[];                        // batch (e.g. AlignLeft)
}

interface Layer {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  order: number;
  includeInPrint: boolean;
  snapTargets: boolean;
  cacheAsStatic: boolean;
}
```

Default layers: `Annotations`, `Furniture`, `Walls`, `Grid & guides`. Users can add custom layers (design example: `Electrical`).

Command payload example (from design): `{ type: "Rotate", target, layer, from: 0, to: 30, pivot: [2.40, 6.40], ts }`.

## Feature specs (from the design)

**Draw Walls (04):** chain mode; click adds point, Shift = free angle, Enter closes, Esc finishes, Backspace removes last point. Angle snap (default 15°), snap to grid (20 cm), snap to endpoints (12 px). Wall thickness (default 0.16 m) and height (2.70 m), alignment Center/Inside/Outside. Auto-join corners with mitre, T-junction detection. Live length/angle label and a wall graph summary (nodes, segments, joins).

**Furniture Library (05):** searchable catalog (`⌘K`), categories (Living, Bedroom, Kitchen, Bath, Office), each item with footprint size. Drag creates a ghost with drop preview, aligned-to hint, collision status, and a single `PlaceFurniture` command on drop. Placement rules: snap back to wall, keep 0.60 m walkway, auto-rotate to nearest wall.

**Transform & Snap (06):** selection handles, rotation with angle snap (5/15/45/90°), live dimension labels, X/Y/W/H/R fields, lock aspect ratio, flip. Snap toggles: grid, walls, smart guides (edges/centers), objects; tolerance slider in px. Appearance: fill, stroke, stroke width.

**Multi-select & Hit Detection (07):** shift+click add/remove, marquee with Intersect and Contain (Alt+drag), Align, Distribute, Group `⌘G`, Duplicate, Delete. Hit pipeline: broadphase spatial hash (2 m cells) -> bbox candidates -> point-in-polygon (even-odd). Debug options: show hit regions, show broadphase grid, log timings. Key case: clicking the empty crook of an L-shaped sofa is inside its bbox but outside its polygon, so the object underneath is selected.

**Layers Manager (08):** drag to reorder (bottom row paints first), visibility, lock, opacity, rename, color, per-layer object counts, "cache as static bitmap". Locked/static layers are rasterised once to an OffscreenCanvas and blitted each frame. Layer changes (`ReorderLayer`, `ToggleLayer`) are undoable.

**History / Command Stack (09):** global stack (limit 200), list with type, description, timestamp, index, HEAD pointer, redo entries greyed out, jump to entry, batch entries expandable. Options: merge drags within 300 ms, persist history in file, branch on edit after undo. Shows undo/redo depth, memory estimate, coalesced count, and a payload inspector. Shortcuts: `⌘Z`, `⌘⇧Z`.

**Performance Debug Overlay (11):** HUD toggled with `F12`: FPS, frame ms vs 16.7 budget, objects, visible/culled, draw calls, dirty rects, cache hit rate, frame breakdown (input, hit-test, update, draw static, draw dynamic, composite), frame history graph, heap, devicePixelRatio, canvas size. Renderer options: static layer caching, dirty-rect redraw, viewport culling, batching same-style paths, show dirty regions. Target: 60 fps with ~840 objects.

**Annotations & Measurements (10, P2):** dimension chains, live measure tool (Enter keeps it as a dimension), callouts, notes, revision clouds, room area labels, title block, area schedule. Units metric/imperial and precision setting.

**Export & Print (12, P2):** PNG, PDF (vector), SVG, JSON project file; paper size, orientation, scale (1:20/1:50/1:100/fit), include layers, sheet elements (title block, north arrow, scale bar). Runs off-thread via OffscreenCanvas.

## Rendering rules

- `requestAnimationFrame` loop; redraw only when dirty.
- Static layers (walls, locked layers) cached in OffscreenCanvas; dynamic layers redrawn in dirty rects.
- Viewport culling with the spatial hash (design: 4 m cells for large plans).
- Overlay (handles, guides, measurements) is separate from content.
- Handle `devicePixelRatio`. Avoid allocations inside the loop.
- Expose frame timing and counters to the status bar and Perf HUD.

## Coding standards

- TypeScript strict, no `any`. Geometry and command code are pure and unit-testable (no DOM/canvas).
- No new runtime dependencies without asking. Dev dependencies for testing are fine.
- Files under ~300 lines. Comments explain *why*.
- **UI must match the Figma design.** For each screen, call the Figma MCP `get_design_context` on its node id and reuse tokens (colors, type, spacing) via CSS variables in one `tokens.css`. Do not hardcode colors in components.
- Do not refactor unrelated code or add features not listed.

## Testing

- **Undo/redo:** random sequences of place/move/rotate/resize/delete/add wall/layer ops; undo all equals initial state, redo all equals final state.
- **Transactions:** rollback leaves the document and stack unchanged. Coalescing merges drags within the window.
- **Batch:** AlignLeft is one entry and undoes as one.
- **Hit testing:** point-in-polygon on edge/vertex/concave shapes (L-sofa crook), rotated shapes, marquee intersect vs contain.
- **Layers:** locked/hidden layers ignore edits, selection, and hit tests; reorder changes hit priority.
- **Walls:** mitred joins, T-junctions, angle snap.
- **Viewport:** world <-> screen round trip is stable at various zoom/pan.
- **Perf:** 850 objects: frame budget under 16.7 ms in the demo scene.

Commands: `npm run dev`, `npm run test`, `npm run typecheck`, `npm run build`.

## Working process

- Work one screen/feature at a time in priority order (P1 first). Suggested order: 06 Transform & Snap -> 07 Hit Detection -> 08 Layers -> 09 History -> 04 Walls -> 05 Library -> 11 Perf HUD.
- Before coding: fetch the Figma node, state a short plan (files to add/change), implement, run typecheck and tests.
- If ambiguous, choose the simplest option consistent with these rules and note the assumption.
- Keep the app runnable after every change.

## Definition of done (per task)

- Typecheck clean, tests pass.
- Matches the Figma screen (layout, tokens, copy) for the UI involved.
- Works with undo/redo, including redo after undo.
- No document mutation outside commands.
- Smooth on the 500+ object demo scene.
