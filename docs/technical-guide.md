# Planwise Technical Guide

This guide explains how the editor is put together: the architecture, how one edit flows through the system, and what each module in `src/` does, down to its main functions. It ends with recipes for the most common extensions.

Read [CLAUDE.md](../CLAUDE.md) alongside it for project rules, design references and recorded decisions.

## Contents

1. [Architecture at a glance](#1-architecture-at-a-glance)
2. [Core concepts](#2-core-concepts)
3. [`core/` reference](#3-core-reference)
4. [`geometry/` reference](#4-geometry-reference)
5. [`render/` reference](#5-render-reference)
6. [`tools/` reference](#6-tools-reference)
7. [`export/` reference](#7-export-reference)
8. [`library/` reference](#8-library-reference)
9. [`ui/` reference](#9-ui-reference)
10. [Recipes](#10-recipes)
11. [Testing and conventions](#11-testing-and-conventions)

---

## 1. Architecture at a glance

```
            ┌──────────────── React (ui/) ────────────────┐
 pointer ─► │ CanvasView ─► active Tool (tools/)          │ ◄─ panels, toolbar, dialogs
 keys       │                  │                          │    subscribe via useSyncExternalStore
            └──────────────────┼──────────────────────────┘
                               ▼
                 Command / Transaction (core/*Commands)
                               │ execute / preview / commit
                               ▼
                 CommandStack ─► Doc (plain data, metres)
                               │ onChange
                               ▼
                 EditorStore.changed()  ──►  React panels re-render
                               │ dirty = true
                               ▼
                 RenderLoop (render/) ── rAF ─► content canvas (layers, dirty rects, caches)
                                                overlay canvas (selection, guides, previews)
```

The layering is strict:

| Folder | Depends on | Must not depend on |
|---|---|---|
| `geometry/` | nothing | everything else |
| `core/` | `geometry/`, `library/` data | DOM, canvas, React |
| `library/` | `core/` types, `geometry/` | DOM, React |
| `render/` | `core/`, `geometry/`, `library/` | React |
| `tools/` | `core/`, `geometry/`, `render/` helpers | React |
| `export/` | `render/`, `core/` | React |
| `ui/` | everything | — |

`core/` and `geometry/` are pure TypeScript. Everything in them runs in Node under Vitest without a browser.

### One edit, end to end

Dragging the bed 50 cm to the right:

1. `ui/CanvasView.tsx` receives `pointerdown`, turns it into a `ToolPointerEvent` (screen px + world m) and calls `tools.select.onPointerDown`.
2. `SelectTool` picks the bed through `core/picking.ts#pickAt`, selects it (`store.select`) and hands the drag to `TransformTool.beginMove`, which opens a transaction: `store.stack.begin()`.
3. On every `pointermove`, `TransformTool` computes the snapped delta (`core/snapping.ts#snapBox`) and calls `tx.update(new TransformCommand('Move', …))`. The transaction undoes the previous preview and applies the new one, so the document always shows the live position.
4. On `pointerup`, `tx.commit()` pushes the last preview command into history as one entry.
5. `CommandStack` calls its `onChange` callback. The store invalidates the hit index, drops selected ids that can no longer be edited, schedules autosave and calls `changed()`.
6. `changed()` sets `dirty = true` and notifies React subscribers: the Properties panel shows the new X, and History shows "Move Bed".
7. On the next animation frame, `RenderLoop` sees `dirty`. `DirtyTracker` finds that only the bed changed, and the content canvas repaints just the bed's old and new rectangles. The overlay canvas redraws the selection frame.

### Frame lifecycle (`render/renderLoop.ts`)

Each `requestAnimationFrame` tick:

1. Returns immediately if `store.dirty` is false (an idle editor costs nothing).
2. Computes the **view key**: pan, zoom, canvas size, DPR, layer states (order, visibility, lock, opacity, color), render options, units and grid step. If it changed, the whole content canvas repaints.
3. Otherwise asks `DirtyTracker` which objects changed since the last frame (reference comparison). A few regions are repainted with clipping; more than 8 regions, or regions covering over half the canvas, fall back to a full repaint.
4. `ContentPainter` draws the grid, then the layers bottom-up. Static layers (locked, or "cache as static") are blitted from `LayerCache`; the others go through `drawLayer`, with furniture culled by `CullIndex` and batched by `SymbolBatcher`.
5. The overlay canvas is cleared and redrawn: selection chrome, guides, tool previews, debug marks, north arrow, scale bar and title block.
6. Phase timings go to `PerfMonitor`, and a stats snapshot is published to the status bar and Perf HUD every 250 ms.

---

## 2. Core concepts

### 2.1 Document model (`core/document.ts`, `core/annotations.ts`)

A plan is a plain-data `Doc`:

```ts
interface Doc {
  name: string;
  sheet?: SheetInfo;   // title block
  layers: Layer[];
  groups: Group[];
  objects: SceneObject[]; // paint order within a layer = array order
}
type SceneObject = Furniture | Wall | Opening | Annotation;
```

| Kind | Key fields | Notes |
|---|---|---|
| `Wall` | `a`, `b` (centreline, m), `thickness`, `align` (center/inside/outside), `height`, `name` | Faces come from `geometry/walls.ts#wallFaces`. |
| `Opening` | `wallId`, `type` (door/window), `offset` (m from `a`), `width`, `hinge`, `swing` | Lives on its host wall; deleting the wall deletes it. |
| `Furniture` | `transform` (centre x/y, w/h, rotation°, flipX), `footprint` (unit polygon), `appearance`, `catalogId`, `groupId`, `room`, `circuit` | Electrical fixtures are furniture with icon `outlet` / `switch` / `light`. |
| `Annotation` | discriminated by `type`: `dimension`, `area`, `callout`, `note`, `revision`, `text` | See `core/annotations.ts`. |

Rules:

- **Units are metres** everywhere in the document. `core/viewport.ts` is the only conversion point. Two deliberate exceptions: `Appearance.strokeWidth` (a line weight) and `TextAnnotation.size` (px).
- **Ids** come from `core/editActions.ts#newObjectId(doc, prefix)`. Prefixes: `w_` walls, `o_` openings, `f_` furniture, `e_` fixtures, `a_` annotations, `g_` groups.
- **Objects are replaced, not mutated.** Commands swap in new object/transform/appearance references, which is what lets `DirtyTracker` detect changes by reference.
- **Layers** carry `visible`, `locked`, `opacity`, `order` (higher paints later), `includeInPrint`, `snapTargets` and `cacheAsStatic`. `isEditable(doc, obj)` is the model rule: locked or hidden layers reject edits.

### 2.2 Commands, transactions and history

Every document change is a `Command` (`core/commands.ts`):

```ts
interface Command {
  type: string;          // what History shows: "Rotate", "AddWall", "MoveToLayer"…
  ts: number;
  describe(): string;
  canExecute?(doc): boolean;   // refuse (e.g. locked layer) → nothing happens
  execute(doc): void;
  undo(doc): void;
  merge?(next): boolean;       // coalescing
  children?: Command[];        // batch
}
```

The command classes:

| Class | File | Used for (`type`) |
|---|---|---|
| `TransformCommand` | `commands.ts` | Move, Rotate, Resize, Flip of furniture |
| `SetAppearanceCommand` | `commands.ts` | fill, stroke, stroke width, opacity |
| `AddObjectsCommand` | `structureCommands.ts` | AddWall, AddDoor, AddWindow, AddAnnotation, PlaceFurniture, PlaceFixture, Duplicate. Can also add missing `layers` in the same step. |
| `DeleteCommand` | `structureCommands.ts` | Delete (a wall takes its openings) |
| `EditObjectsCommand` | `structureCommands.ts` | The generic "replace objects with edited copies" command: wall moves/resizes, opening edits, MoveAnnotation, EditAnnotation, RenameRoom, AddRoom, DeleteRoom, ExtendDimension, SetCircuit, MoveToLayer |
| `BatchCommand` | `structureCommands.ts` | Align/Distribute, furniture+wall moves: one entry, children shown as a tree |
| `GroupCommand`, `UngroupCommand` | `structureCommands.ts` | ⌘G, ⇧⌘G |
| `LayerPropsCommand` | `layerCommands.ts` | ToggleLayer, SetLayerOpacity, RenameLayer, SetLayerColor (exempt from the lock rule so you can unlock) |
| `ReorderLayerCommand`, `AddLayerCommand`, `DeleteLayerCommand` | `layerCommands.ts` | Layers manager |
| `DocPropsCommand` | `docCommands.ts` | RenamePlan, EditSheet |

`CommandStack` (`core/commandStack.ts`) is the single global history:

- `execute(cmd)` refuses when a transaction is open or `canExecute` fails, runs the command, then pushes it. Push discards the redo tail, or keeps it as a **branch** when "branch on edit" is on. It merges with the previous command when the ts gap is within the merge window (300 ms) and `merge()` accepts. History is capped at 200 entries.
- `undo`, `redo`, `jumpTo(seq)`, `clearRedo`, `switchBranch`.
- `begin()` opens a **Transaction**: `update(cmd)` swaps the preview (undo the old one, execute the new), `commit()` pushes the last preview, `rollback()` restores the document exactly. Only one transaction exists at a time; `begin()` rolls back a stale one.
- `snapshot()` / `load()` for persistence. `core/commandCodec.ts` turns commands into JSON by registered tag and rebuilds them on their class prototype.

### 2.3 Store (`core/store.ts`, `core/storeFeeds.ts`)

`EditorStore extends StoreFeeds` is the one object the whole app shares.

- **`StoreFeeds`** is the notification layer:
  - `subscribe` / `getVersion` / `changed()` for React (`useSyncExternalStore`) and the `dirty` flag for the render loop;
  - two fast channels (`subscribeStats`, `subscribeHover`) that only their own readers follow;
  - hit-test settings, last/hover picks and the running pick cost.
- **`EditorStore`** holds:
  - `doc`, `stack`, `history` (HistoryController), `tools` (ToolState), `perf` (PerfState), `exporter` (ExportState);
  - `selection`, `activeLayerId`, `viewport`, `snap`, `lockAspect`, `feedback` (guides and live labels).

  Its actions are thin: each builds a command with a pure helper (`core/editActions.ts`, `docCommands.ts`, `layerCommands.ts`) and runs it. Examples: `select`, `setLayer`, `addLayer`, `deleteLayer`, `applyTransform`, `setAppearance`, `align`, `distribute`, `editObjects`, `moveToLayer`, `renamePlan`, `editSheet`, `group`, `ungroup`, `duplicate`, `deleteSelection`, `undo`, `redo`.

Values that change on every pointer move (wall draft, furniture ghost, measure draft) live on their state objects with their own subscribe functions, so panels don't re-render per move. See `ui/useStore.ts`.

### 2.4 Tools and input (`tools/Tool.ts`, `ui/CanvasView.tsx`)

A tool is a state machine behind this interface:

```ts
interface Tool {
  id: string; cursor: string;
  onPointerDown / onPointerMove / onPointerUp(e, ctx): void;
  onPointerLeave?(ctx); onDoubleClick?(e, ctx);
  onKey?(e, ctx);                      // keydown (and Shift keyup)
  ownsKey?(e, ctx): boolean;           // keys the tool keeps over global shortcuts
  cancel(ctx): void;                   // roll back / drop previews
}
```

`CanvasView` routes keys in a fixed order:

1. Ignore keys while a modal is open; `F12` toggles the HUD; ignore keys typed in inputs.
2. ⌘-shortcuts: undo/redo, jump, `⌘K`, `⌘G` / `⇧⌘G`.
3. `tool.ownsKey(e)` → `tool.onKey`. Examples: Furniture keeps `R`; Wall and Revision keep Enter/Esc/Backspace.
4. Tool letters (`V H W D O F E T L M N R`), then Delete, Space-pan, and finally `tool.onKey`.

Switching tools (key, rail, Library drag) calls `cancel()` on the previous tool, so an open drag never holds the stack. Per-tool state that must not survive a switch lives in `ToolState` sub-states, which `setActive` resets.

### 2.5 Persistence (`core/persistence.ts`, `core/historyController.ts`)

- The project file is `{ version: 1, doc, history, savedAt }`. Autosave writes it to `localStorage` (`planwise:project:v1`) 400 ms after a change while "Persist history in file" is on; history options are stored separately.
- On start, `EditorStore(doc, storage, 'restore')` loads a saved project into the shared `doc` in place. `'replace'` (New plan, Import, Open demo) saves the new plan immediately.
- The JSON export (`Export → JSON`) is the same file, pretty-printed; `parseProject` validates imports.
- Units & precision are editor settings and are not saved.

---

## 3. `core/` reference

### Document and annotation types

**`document.ts`**: the plan model (§2.1) plus helpers.
- `findObject`, `findFurniture`, `findGroup`, `findLayer`: lookups by id.
- `layersTopDown(doc)`: layers as the Layers panel lists them (top of paint order first).
- `isEditable(doc, obj)`: the lock/hide rule every command checks.
- `isFixture(icon)`: outlets, switches and lights draw in their layer's color.
- `cloneDoc`: deep copy (tests); `RECT_FOOTPRINT` / `ellipseFootprint()`: unit footprints.

**`annotations.ts`**: `DimensionAnnotation` (runs of collinear points + offset), `AreaAnnotation` (rooms: name, polygon, label point), `CalloutAnnotation`, `NoteAnnotation`, `RevisionAnnotation`, `TextAnnotation`.
- `polygonArea`: shoelace area in m².
- `formatLength` / `formatArea`: metric (`2.64 m`) or imperial (`8′ 7½″`, ft²) at a precision from `PRECISIONS`.
- `measureCount`: measurement count for the Layers list.

### Store and feeds

- **`store.ts`**: `EditorStore` (§2.3).
- **`storeFeeds.ts`**: `StoreFeeds` base class: change feeds, `dirty`, hover/last-hit picks, `setHit`, `setHover`, `setLastHit`, `publishStats`.
- **`channel.ts`**: `Channel`: a tiny subscribe/emit feed.
- **`storeTypes.ts`**: `ToolFeedback` (guides, rotate label, marquee), `HitSettings`, `FrameStats`.

### Commands, history and persistence

- **`commands.ts`**: `Command` interface, `TransformCommand` (per-target from/to transforms, merges consecutive edits of the same targets), `SetAppearanceCommand`.
- **`structureCommands.ts`**: `BatchCommand`, `DeleteCommand`, `AddObjectsCommand` (optional `layers` created with the objects), `GroupCommand` (removes groups merged whole into the new one), `UngroupCommand`, `EditObjectsCommand` (checks source and target layers are editable; merges consecutive edits of the same ids).
- **`layerCommands.ts`**: `LayerPropsCommand.of(doc, type, id, patch)`, `ReorderLayerCommand` (rewrites orders densely), `AddLayerCommand`, `DeleteLayerCommand` (removes the layer's objects, undo restores them), `newLayer`, `LAYER_COLORS`.
- **`docCommands.ts`**: `DocPropsCommand` (plan name / title block), `renamePlanCommand`, `editSheetCommand`, `docEntryView` (its History row).
- **`editActions.ts`**: pure command builders used by the store and panels:
  - `newObjectId`: next free id with a prefix.
  - `groupCommand` (furniture only, ≥ 2 units), `ungroupCommand`, `duplicateCommand`.
  - `offsetsCommand` (align/distribute/move-to as a batch), `moveUnitsToCommand`, `resizeUnitsCommand`.
  - `moveToLayerCommand` (walls take their openings), `editObjectsCommand` (edited copies → one command, or null if unchanged).
  - `wallWithOpenings`: a reshaped wall plus re-seated openings, followed neighbours and fixtures.
- **`commandStack.ts`**: `CommandStack`, `Transaction`, `StackOptions` (limit 200, merge window 300 ms, branchOnEdit), `HistoryEntry`, `Branch`, `StackSnapshot` (§2.2).
- **`commandCodec.ts`**: `encodeCommand` / `decodeCommand` via a tag registry; `encodeHistory` / `decodeHistory`; `historyBytes` (the "memory" figure). **Register every new command class here.**
- **`historyController.ts`**: `HistoryController`: left-panel tab, History filter, inspected entry, undo/redo toast, the three stack options, autosave scheduling, restore.
- **`historyView.ts`**: `entryView(cmd, doc)`: how a command reads in History and the toast (title, detail, icon, category, human phrase, batch children).
- **`historyPayload.ts`**: `entryPayload(cmd, doc)`: the payload inspector's JSON; `formatPayload`: compact pretty-printing.
- **`persistence.ts`**: `projectJson`, `saveProject`, `loadProject`, `parseProject`, `clearProject`, history options load/save, `browserStorage`.

### Tool state

- **`toolState.ts`**: `ToolState`: active `ToolId`, Wall tool settings (`DEFAULT_WALL`: 0.16 m, 2.70 m, center, 0/45/90°) and chain, the live `WallDraft`, plus the sub-states below. `setActive` resets all of them.
- **`placeState.ts`**: `PlaceState` for Door, Window, Dimension, Text, Note and Revision:
  - settings: opening widths/hinge, text size, cloud mode, text mode (label/room), note mode (note/callout), dimension chaining;
  - the canvas `preview` (opening, dimension, cloud, room);
  - the open `entry` (an input waiting for words) and `commit()`, which turns it into one command. `nextRev()` gives the next Δ number.
- **`measureState.ts`**: `MeasureState`: Measure tool draft (own channel) and annotation display settings (units, precision, terminator, snap targets, show areas); `keep()` → dimension, `addNote()` → note.
- **`furnitureState.ts`**: `FurnitureState`: armed catalog item, upholstery per family, placement rules, manual rotation, search/category, the ghost (own channel), `toFurniture`.
- **`electricalState.ts`**: `ElectricalState`: armed fixture, armed circuit (`newCircuit`), preview, Library drag (`startDrag` / `endDrag`), `toFixture`.
- **`annotationState.ts`**: `AnnotationEditState`: clicked piece (`focus`), hovered piece, inline editor (`openEditor`, `commitText`), `deleteFocusedRoom`.
- **`perfState.ts`**: `PerfState`: HUD on/off, right-panel tab (Properties / Document / Performance), renderer options, `PerfMonitor`.
- **`exportState.ts`**: `ExportState`: dialog open, options (layer ticks reset on each open), file name, busy/error.

### Selection, picking and snapping

- **`spatialIndex.ts`**: `SpatialHash`: uniform grid (2 m for picking, `HIT_CELL_M`) over axis-aligned bounds: `insert`, `queryPoint`, `queryRect`, `boundsOf`.
- **`picking.ts`**:
  - `HitIndex`: spatial hash of every pickable outline (furniture, walls, openings) on visible, unlocked layers, with paint rank. Built lazily after each document change.
  - `pickAt(index, p, mode)`: broadphase cell → bbox candidates → even-odd polygon test, top-down. Returns a `HitReport` for the debug panel.
  - `marqueePick(index, rect, 'intersect' | 'contain', mode)`.
  - `hitLogLine`: the "log timings" console line.
- **`selection.ts`**:
  - `expandGroups`: clicking a member selects the group.
  - `selectionUnits` / `unitsBounds`: "units" = a lone piece or a whole group, as align/distribute and the header count them.
- **`align.ts`**: `alignOffsets`, `distributeOffsets` → per-unit offsets.
- **`snapping.ts`**:
  - `SnapSettings` / `DEFAULT_SNAP`: grid 20 cm, tolerance, angle step, toggles; `GRID_STEPS`, `gridLabel`.
  - `snapAngle`, `snapToGrid`.
  - `snapBox(box, targets, settings, tol)`: per-axis correction for a moving box. Smart guides (edges/centres), wall faces and objects win over the grid.
- **`structure.ts`**: wall and opening helpers:
  - `wallLength`, `hostWall`, `openingsOf`.
  - `kindName` / `displayName` / `objectLabel`: how pieces are named.
  - `wallQuad`: square-ended wall body; `objectOutline`: the outline used for picking and highlight.
- **`structureEdit.ts`**: pure wall and opening edits:
  - walls: `translateWall`, `moveWallEnd`, `setWallLength`;
  - openings: `fitOpening`, `slideOpening`, `moveJamb`, `reseatOpenings` (re-measure openings after the wall changed);
  - `alongWall`, `snapAlong` (snap along a wall to the world grid).
- **`wallSnap.ts`**: `snapWallPoint`: where a Wall-tool click lands. Priority: existing endpoint (12 px) → angle-snapped ray with grid length → onto a nearby wall line (T-junction). Also `allowedAngles`, `screenAngle`, `rayOnWall`.
- **`wallFollow.ts`**:
  - `planSnapshot(doc)`: editable walls, openings and wall fixtures at drag start.
  - `followWalls(snapshot, changed, skip)`: walls cornered or T'd onto edited walls stretch their touching end and re-seat their openings. Outlets/switches ride along with a wall moved whole, and stay put on a wall that only stretches.

### Placement rules

- **`placement.ts`**: `placeItem(input)`: furniture drop. Auto-rotate the back to the nearest wall (rule), push back against the wall, align with other pieces or the grid per free axis, then report collisions and the tightest walkway gap under `WALKWAY_M` (0.60 m).
- **`openingPlace.ts`**: `placeOpening(p, walls, openings, type, width, hinge, flip, reach)`: door/window on the nearest wall, centred on the pointer, clamped with `MIN_JAMB_M` jambs. The swing follows the pointer's side. Refused with a reason for a short wall or an overlap.
- **`fixturePlace.ts`**: `placeFixture(kind, p, walls, openings, reach, grid)`: lights go on the grid; outlets/switches go flush on the nearest wall face in 5 cm steps, out of doorways (switches also out of windows). Outlets face into the room.
- **`circuits.ts`**: `circuitsOf(doc)` (circuits with switch/light counts, number-ordered), `nextCircuitId`, `circuitMates`, `circuitLabel`, `circuitSummary`.

### Rooms and annotations

- **`roomDetect.ts`**: `RoomGrid`: walls rasterised into 2 cm cells (coarser on huge plans). `roomAt(p)` flood-fills the cell under `p` and returns the room's outline and net area, or null when the space leaks outside. Wall faces on a 1–2 cm grid give exact results.
- **`roomLabels.ts`**:
  - `labelledRoomAt`: an existing room label under the pointer.
  - `addRoomCommand`: add a room to the plan's area annotation, or create one.
  - `calloutAt`: build a callout.
  - `RoomGridCache`: rebuilds the grid only when visible walls change.
- **`rooms.ts`**: `roomOf(doc, p)`: the labelled room at `p`, used for furniture/fixture room tags and new wall names.
- **`annotationLayout.ts`**: screen layout shared by drawing, picking and inline editing:
  - `layoutAnnotation(a, viewport, style, measure)`: the pickable pieces (box, pin, room label, dimension run, cloud outline, label);
  - `hitShape`, `samePart`, `runLine`, `calloutWidth`, `revisionLabel`;
  - box/font constants.
- **`annotationEdit.ts`**:
  - `pickAnnotation`: the topmost annotation piece at a screen point on visible, unlocked layers.
  - `moveAnnotationPart`: drag one piece; a dimension run only moves along its normal.
  - `partText` / `withPartText`: the words a double-click edits; names follow the text.

### Layers, perf and export options

- **`layerStats.ts`**:
  - `layerObjects`, `isCustomLayer`, `layerStatus` (card subtitle);
  - `contentBounds`, `layerContents` (counts by kind, circuits);
  - `layerSignature`: a hash of a layer's geometry and style that invalidates its static cache.
- **`layerRows.ts`**: `listRows` (compact Layers list: groups as one row, openings under their wall) and `managerRows` (Layers manager cards, same-name pieces folded).
- **`perf.ts`**:
  - `RenderOptions` / `DEFAULT_RENDER`: the five renderer switches;
  - `FRAME_BUDGET_MS` (16.7), `PHASES`;
  - `PerfMonitor`: per-frame phase timings, frame history, long-frame detection;
  - snapshot types for the HUD.
- **`exportOptions.ts`**:
  - `ExportOptions` (format, paper, orientation, scale, per-export layer ticks, sheet elements), `defaultExportOptions`;
  - `printedLayers` (ticks, else each layer's `includeInPrint`), `printedBounds`;
  - `sheetLayout`: paper, margins, title block, plan area and "fit" scale in mm;
  - `defaultFileName`, `estimateBytes`, `formatBytes`.
- **`viewport.ts`**: `Viewport` (`pxPerMetre` 50, `zoom`, `panX/Y`):
  - `worldToScreen`, `screenToWorld`, `screenLengthToWorld`, `worldLengthToScreen`, `scaleOf`;
  - `visibleWorldRect`, `zoomAt` (zoom about a screen point), `MIN_ZOOM` / `MAX_ZOOM`.

---

## 4. `geometry/` reference

Pure math, no project types except `Wall` / `Opening` shapes.

- **`vec.ts`**: `Vec2`, `Rect`, `DEG`, `rotate`, `rotateAround`, `angleDeg` (+y down), `normalizeDeg`, `boundsOf`, `unionRect`, `rectCenter`.
- **`transform.ts`**: object placement math.
  - `Transform` (centre x/y, w/h, rotation°, flipX); `HANDLES`, `handleDir`, `handlePosition`.
  - `localToWorld` / `worldToLocal`, `footprintToWorld` (unit footprint → world polygon), `cornersOf`, `aabbOf`.
  - `resizeFromHandle`: resize in the object's rotated frame, keeping the opposite side fixed, with optional aspect lock.
  - `rotateTransform` (orbit about a pivot), `mapTransformBox` (refit when a group box stretches).
  - `normalizeRotation`, `transformsEqual`, `MIN_SIZE`.
- **`hitTest.ts`**:
  - `pointInPolygon`: even-odd, no allocation. `rayCrossings`: the same rule, returning the crossing points the debug overlay draws.
  - `pointInRect`, `distance`, `distanceToSegment`, `rectsOverlap`, `segmentsIntersect`.
  - `polygonInsideRect` (marquee Contain), `polygonIntersectsRect` (marquee Intersect).
- **`walls.ts`**:
  - `wallFaces(w)`: face offsets for center/inside/outside alignment.
  - `buildWallGraph(walls)`: which ends meet (corner), end on a wall (T) or stand alone; nodes; enclosed room count (Euler).
  - `wallPolygon(w, graph, mitre)`: the wall body with mitred L corners and square T/free ends.
- **`openings.ts`**: `openingShape(wall, opening)`: the cut polygon, the axis, and for doors the hinge, the open leaf (90°) and the closed end for the swing arc.
- **`clearance.ts`**: `polygonsOverlap` (concave-safe, touching ≠ overlapping) and `polygonGap` (shortest distance between outlines: walkway checks).

---

## 5. `render/` reference

All drawing uses a `CanvasRenderingContext2D` (or `OffscreenCanvasRenderingContext2D`, or the export recorder). Colors come from `readTheme()` (CSS variables), never literals.

### Loop and content

- **`renderLoop.ts`**: `RenderLoop(content, overlay, store)`: the rAF loop (§1). It sizes both canvases for DPR, computes the view key, runs the content pass, draws the overlay, times the phases, and publishes stats every 250 ms. It also registers off-screen buffers for the Performance tab.
- **`contentPass.ts`**: `ContentPainter.paint(g, store, theme, dpr, size, area, stats)`: grid, then layers bottom-up, over the whole view or inside one dirty region. Static layers blit from `LayerCache`; hidden layers are drawn faintly while the Layers manager is open.
- **`dirtyRects.ts`**: `DirtyTracker`: diffs object/transform/appearance references against the last frame and returns merged screen regions (with labels for the HUD), or "full". Walls, openings, annotations and wired fixtures force a full repaint. `mergeRegions`.
- **`cullIndex.ts`**: `CullIndex`: furniture in 4 m cells (`CULL_CELL_M`), queried for the visible rect. Rebuilt when the document changes.
- **`layerCache.ts`**: `LayerCache`: one off-screen canvas per static layer, keyed by view + `layerSignature`. It reports hit/miss for the HUD's cache rate.
- **`batchDraw.ts`**: `SymbolBatcher`: collects catalog pieces sharing a symbol and style into one path per part. The context transform is set per member, so nothing is allocated per piece. The batch keeps paint order across layers.
- **`drawScene.ts`**:
  - `drawLayer(g, doc, layer, pass)`: walls (mitred, with opening cuts), openings, furniture, fixtures, circuit wires and annotations of one layer.
  - `drawGrid` with adaptive `gridSpacing` (minor ≥ 16 px, major every 5).
- **`drawFurniture.ts`**:
  - `drawFurniture`: catalog symbol or footprint, in the object's local frame via the context transform.
  - `drawFixture`: outlet half-disc, "S" switch, light with a cross, in the layer color.
  - `drawCircuits`: dashed, bowed wire from each switch to its lights.
- **`drawSymbol.ts`**: `drawSymbol`, `tracePart`, `paintPart`: catalog symbols from unit-space parts. Shared by the canvas, the drag ghost, Library thumbnails and batching.
- **`drawAnnotations.ts`**: `drawAnnotation(g, a, viewport, theme, style)` for every annotation type; `drawTerminator` (tick/arrow/dot); `cloudPath` (scalloped revision outline).
- **`rulers.ts`**: `drawRulers`, `rulerStep`, `RULER_PX`.
- **`titleBlock.ts`**: `drawTitleBlock`: the sheet box in the canvas corner.
- **`textMeasure.ts`**: `canvasMeasure(g, theme)` and `measureText` (off-screen; estimates in Node) for annotation layout.
- **`theme.ts`**: `CanvasTheme`, `readTheme()`: CSS variables → canvas colors and fonts.
- **`pill.ts`**: `pill(g, text, x, y, color, theme)`: the mono label chip used by every overlay.

### Overlays (redrawn every drawn frame)

- **`overlay.ts`**: `drawOverlay`: the overlay pass in order: broadphase debug → selection (single: handles, W×H label, wall distances; multi: group box) → structure and annotation selection → circuit highlight → redo preview → tool previews (wall, ghost, measure, place, fixture) → marquee → hit regions → snap guides → labels. `drawSheetMarks` draws the north arrow and scale bar.
- **`multiSelection.ts`**: `drawMultiSelection` (unit outlines, padded box, handles, "N selected · W × H" chip); `drawMarquee`.
- **`structureOverlay.ts`**: `drawStructureSelection`: walls/openings outline, plus end/jamb handles for a single one.
- **`annotationOverlay.ts`**: `drawAnnotationSelection`: selected annotation pieces and the hover hint.
- **`wallOverlay.ts`**: `drawWallOverlay`: Wall tool nodes, lengths, dimension chains, the segment being drawn with angle guide, snap target and readouts.
- **`ghostOverlay.ts`**: `drawGhostOverlay`: furniture drop target, alignment and walkway guides, the translucent ghost and "+" badge.
- **`placeOverlay.ts`**: `drawPlaceOverlay`: door/window cut and swing, dimension preview, entry crosshair. It calls:
  - **`cloudOverlay.ts`** `drawCloudOverlay`: revision cloud while dragging or clicking points, and while typing its note;
  - **`roomOverlay.ts`** `drawRoomOverlay`: the room under the pointer with its area, an already-labelled room, the callout pin while typing.
- **`fixtureOverlay.ts`**: `drawFixturePreview` (Electrical tool ghost, wall/circuit pill, trial wires) and `drawCircuitHighlight` (selected switch/light: its circuit).
- **`measureOverlay.ts`**: `drawMeasureOverlay` (measured line, snap chips, readout); `measureAngle`.
- **`hitDebug.ts`**: `drawHitRegions` (tested polygon, numbered vertices, even-odd ray and crossings) and `drawBroadphase` (occupied 2 m cells with counts).
- **`historyPreview.ts`**: `drawRedoPreview`: a dashed ghost of what redoing the inspected entry would do.
- **`perfOverlay.ts`**: `drawPerfOverlay`: dirty regions and cull bounds while the HUD is on.

### Sheet (export and preview)

- **`sheet.ts`**: `drawSheet(target, doc, options, layout, theme, style)`: the printed page in points. It draws paper, border, the plan at scale in its frame (printed layers and annotation kinds only), north arrow, scale bar and title block. The same function draws the modal preview, the 300 dpi PNG and the vector recorder. `PT_PER_MM`.

---

## 6. `tools/` reference

Each tool implements `Tool` (§2.4). Tools read the store through `ctx.store` and change the document only through commands.

- **`Tool.ts`**: `Tool`, `ToolPointerEvent` (screen px + world m + modifiers), `ToolContext` (`store`, `setCursor`), `DRAW_KEYS`.
- **`SelectTool.ts`**: click, Shift+click, marquee (Alt = Contain). It picks annotations on screen first (`annotationUnder`), where layer order decides against object picks. Drags on handles or the selection go to `TransformTool`, wall ends and jambs to `StructureTool`, annotation pieces to `AnnotationDrag`. Double-click edits annotation text.
- **`TransformTool.ts`**: move (with a 3 px start threshold and `snapBox`), rotate (angle snap, Shift = free), resize single and group (aspect lock, Shift inverts). A furniture+wall move is one batch. `snapTargets` respects each layer's "snap targets" flag.
- **`StructureTool.ts`**: drags a wall end (`moveWallEnd`, openings re-seated, neighbours follow) or a door/window jamb (`moveJamb`). Also `structureHandles`, `structureSizeLabel`.
- **`structureMove.ts`**: `structureStarts` (snapshot at drag start) and `structureMoveCommand`: walls translate with their followers, lone openings slide along their wall in 5 cm steps.
- **`selectionFrame.ts`**: `selectionFrame` (single rotated box or group bounds), handle and rotate-knob positions, handle cursors.
- **`annotationDrag.ts`**: `annotationUnder` (the annotation piece above the object pick, by layer order); `AnnotationDrag` (one `MoveAnnotation` transaction).
- **`HandTool.ts`**: drag to pan (viewport only, no command).
- **`WallTool.ts`**: chain drawing with `snapWallPoint`. Each segment is one `AddWall` (named from rooms); Enter closes, Esc finishes, Backspace removes the last segment. Wall settings come from `ToolState.wall`.
- **`OpeningTool.ts`**: `new OpeningTool('door' | 'window')`: hover preview through `placeOpening`, click → `AddDoor` / `AddWindow`. Shift (down or up) flips the hinge in place.
- **`FurnitureTool.ts`**: ghost via `placeItem`, drop on click or on releasing a Library card → `PlaceFurniture`, then back to Select. It owns `R` to turn the ghost.
- **`ElectricalTool.ts`**: preview via `placeFixture`, click → `PlaceFixture` on the armed circuit (the tool stays armed). It creates the Electrical layer on plans without one. Keys `1/2/3` pick the fixture; it takes Library card drops too.
- **`TextTool.ts`**: `new TextTool('text' | 'note')`.
  - Label and note modes: a click opens an entry.
  - Callout mode: pin + two-line entry.
  - Room mode: hover detects the room (`RoomGridCache`), a click names it or renames an existing label.
- **`DimensionTool.ts`**: click · click · pull · click → `AddAnnotation`. With "Continue as chain", further clicks extend it (`ExtendDimension`) until Enter/Esc. Snapping goes through `snapMeasure`, Shift gives 45° steps.
- **`dimensionChain.ts`**: `extendChain` (insert a projected point in order along the chain) and `withChain`.
- **`MeasureTool.ts`**: live measurement (own draft channel), Enter keeps it as a dimension.
- **`RevisionTool.ts`**: Rectangle (drag; Shift = square) or Points (click corners; first point / Enter / double-click closes; Backspace undoes a point). Places the Δ tag and opens the "what changed" entry. The draft lives in `PlaceState.preview`, so a tool switch drops it.

---

## 7. `export/` reference

Export draws the sheet once with the same renderer as the screen, then encodes it.

- **`vectorContext.ts`**: `VectorContext`: a recording implementation of the Canvas 2D API subset the renderer uses (paths, transforms, `save`/`restore`, clip, fill/stroke, `fillText` with `measureText`, dash, alpha). It records `VectorOp`s instead of pixels, so `drawSheet` can produce vector output unchanged.
- **`vectorTypes.ts`**: `VectorOp`, `Seg`, `Paint`, `Stroke`; `parseColor` (hex/rgb(a) → hex + alpha), `parseFont` ("600 11px IBM Plex Sans" → weight/size/mono), `KAPPA`.
- **`vectorCurves.ts`**: `traceRoundRect`, `ellipseBeziers`: arcs and rounded corners as cubic Béziers.
- **`svg.ts`**: `buildSvg(ops, w, h)`: one `<path>` per fill or stroke, `<text>` with rotation, clips as nested groups, sized in mm for true-scale printing; `pathData`.
- **`pdfDoc.ts`**: `svgToPdf(svg, w, h, title)`: lazy-loads `jspdf` + `svg2pdf.js`, embeds the IBM Plex TTFs from `public/fonts` (registered under svg2pdf's font naming), and renders the SVG into a vector PDF page.
- **`runExport.ts`**: `ExportJob` (doc, options, theme). `sheetSvg` records `drawSheet` into SVG. `exportBlob` produces PNG (OffscreenCanvas at 300 dpi → `convertToBlob`), PDF, SVG or JSON (`projectJson`). `download(blob, name)` and `printSheet` (the vector sheet in a hidden iframe with `@page` size) complete the flow.

Export runs on the main thread. Only PNG encoding may happen off-thread inside `convertToBlob`.

---

## 8. `library/` reference

Data and builders for content. No UI.

- **`catalog.ts`**: `CatalogItem` (id, title, category, w/d, icon, footprint, appearance, `SymbolPart[]`, placement flags, family/variant, thumb size), `CATEGORIES`, `UPHOLSTERY` swatches, `MATERIAL`.
  - `CATALOG`, `catalogItem(id)`, `variantsOf`, `searchCatalog(query, category)`, `sizeLabel`, `catalogPath`.
- **`catalogShapes.ts`**: `build(spec)` plus `rect` / `ellipse` / `line` / `poly` part helpers used to author symbols in unit space.
- **`catalogLiving.ts`**, **`catalogUtility.ts`**, **`catalogExtras.ts`**, **`catalogItems.ts`**: the 29 catalog items by room, combined into `CATALOG_ITEMS`.
- **`electrical.ts`**:
  - `FIXTURES`: outlet 0.24×0.12, switch 0.28, light ø0.36, with `onWall` / `wired` flags; `FIXTURE_KINDS`.
  - `fixtureObject(kind, id, transform, circuit)`, `electricalLayer(doc)` (the Electrical layer for plans without one), `createElectrical()` (demo fixtures).
- **`demoScene.ts`**: `createDemoDoc()`: *Harbor St. Residence — Unit 4B* (walls, openings, furniture, electrical, annotations, title block, layers; Walls locked).
- **`demoAnnotations.ts`**: `createDemoAnnotations()` (dimension chains, room areas, callout, note, revision cloud) and `DEMO_SHEET`.
- **`officeScene.ts`**: `createOfficeDoc()`: *Northgate* stress plan, 842 objects (`?plan=northgate`).
- **`templates.ts`**: `TEMPLATES` (blank, studio, two-bed, office), `buildPlan(template, shape)` for the New plan dialog, `templateSummary`.
- **`rooms.ts`**: `ROOMS`, `roomAt`: fixed demo room rectangles, used only to build the demo. At runtime, rooms come from `core/rooms.ts`.
- **`wallNames.ts`**: `wallName(w, roomAt)`: "Kitchen / Study", "Exterior · North" or "Wall", from the rooms on each side.

---

## 9. `ui/` reference

React components render panels and dialogs only. They read the store with `useEditor()` (re-render on any change) or a narrower hook. They change the document only through store actions, i.e. commands.

| Area | Components |
|---|---|
| App shell | `App.tsx` (layout, tools map), `workspace.tsx` (start/open/import plans, `fitView`), `useStore.ts` (hooks: `useEditor`, `useFrameStats`, `useWallDraft`, `useGhost`, `useMeasureDraft`, `useEditorStoreRef`) |
| Canvas host | `CanvasView` (events → tools, key routing, tool-switch cancel), `ToolHint`, `AnnotationEntry` (new text/note/callout/room/revision input), `AnnotationEditor` (double-click edit), `UndoToast`, `HitDebugPanel`, `PerfHud`, `LayerBadges` |
| Top bar and rail | `TopBar`, `LogoMenu`, `PlanName`, `ToolRail`, `RailTip`, `GridSize` (`GridSizeSelect`, `GridPopover`) |
| Left panel | `LeftPanel` (Layers list), `LayersManager` + `LayerCard` + `RenderOrder` + `layerDnd`, `LibraryPanel` + `ChipScroller` + `SymbolThumb` + `FixtureThumb`, `HistoryPanel`, `WallGraphCard`, `MeasureCards`, `PerfLayers` |
| Right panel | `PropertiesPanel` (routes by tool/selection), `AppearanceSection`, `SnappingSection`, `HitDetectionSection`, `MultiSelectionPanel`, `StructurePanel`, `AnnotationPanel`, `LayerSection` (move to layer), `ElectricalPanel` + `CircuitChips`, `FurniturePanel`, `WallToolPanel`, `PlacePanel`, `MeasurePanel`, `LayerPanel`, `HistoryInspector`, `DocumentPanel`, `PerfPanel` |
| Dialogs | `NewPlanModal` + `PlanSettings` + `TemplateThumb`, `ExportModal` + `ExportSettings` |
| Primitives | `controls.tsx` (`Section`, `NumberField`, `TextField`, `Toggle`, `IconButton`, `Segmented`, `ReadonlyField`, `TextButton`), `MonoSegments`, `Slider`, `MoreToggle`, `PanelTabs`, `Icon`, `itemIcons`, `historyIcons`, `cn` |
| Styling | `tokens.css` (design tokens as CSS variables), `index.css` (Tailwind theme mapping) |

Thumbnails (`SymbolThumb`, `FixtureThumb`, `TemplateThumb`) call the canvas renderer itself, so a card always shows what lands on the plan.

---

## 10. Recipes

### Add a command

1. Write the class, usually in `core/structureCommands.ts` or a new `core/*Commands.ts`. Implement `type`, `ts`, `describe`, `execute`, `undo`, and `canExecute` if the command touches layers that could be locked.
2. Keep all state needed for undo on the instance (`from` / `to` copies). Commands must be plain data: the codec serialises own fields.
3. Register it in `core/commandCodec.ts` (`REGISTRY`).
4. Give it a History row in `core/historyView.ts` (or its own `*EntryView`) and a payload in `core/historyPayload.ts`.
5. Add a builder (`core/editActions.ts`) and, if the UI needs it, a one-line store action.
6. Test: execute → undo equals the original document, redo equals the result, locked layers refuse it.

If the edit replaces whole objects, prefer `EditObjectsCommand` with a new `type` string over a new class: `store.editObjects('MyEdit', [edited copies])`.

### Add a tool

1. Implement `Tool` in `src/tools/MyTool.ts`. Keep transient state in the tool or in a `ToolState` sub-state if it must reset on tool switch or be read by panels and overlays.
2. Add the id to `ToolId` (`core/toolState.ts`) and the instance to the tools map in `App.tsx`.
3. Add a rail button with a tooltip (`ui/ToolRail.tsx`, including the `WIRED` list), a shortcut letter in `CanvasView` `TOOL_KEYS` if it needs one, and an entry in `LeftPanel`'s per-tool open-layer map.
4. If it keeps keys that are also shortcuts, implement `ownsKey`.
5. Draw its preview from an overlay function called in `render/overlay.ts`; mark the frame dirty (`store.dirty = true`) when the preview changes.
6. Add a right-panel section, and a `ToolHint` entry if it draws onto a layer that may be locked.

### Add a catalog item

1. Author it in the right `library/catalog*.ts` with `build({ … parts })`: unit-space parts, outline first, footprint polygon, appearance, `againstWall` if it backs onto walls.
2. It shows in the Library automatically (category, search, size label). Give `family` / `variant` for size variants.
3. Check the thumbnail size (`thumb`) against the 64 × 44 card.

### Add an annotation type

1. Extend the `Annotation` union (`core/annotations.ts`).
2. Draw it in `render/drawAnnotations.ts#drawAnnotation`, and lay out its pickable parts in `core/annotationLayout.ts#layoutAnnotation`.
3. Handle it in `core/annotationEdit.ts` (move, text), `core/layerStats.ts` (signature, counts), `core/structure.ts` (`kindName`), `ui/itemIcons.tsx` (glyph) and `library/templates.ts#scaleAnnotation` if templates scale it.
4. Create it through a tool using `AddObjectsCommand('AddAnnotation', …)`.

### Add a renderer option

1. Add the flag to `RenderOptions` / `DEFAULT_RENDER` (`core/perf.ts`) and a row in `ui/PerfPanel.tsx`.
2. Read it in `render/renderLoop.ts` or `contentPass.ts`. Include it in the view key if it changes every pixel.

---

## 11. Testing and conventions

- `yarn test` runs every suite in `src/tests/`. Tests drive the real store, commands and tools with synthetic `ToolPointerEvent`s. No DOM is needed: `measureText` estimates widths in Node, and storage is `null`.
- Useful fixtures: `createDemoDoc()` (Walls layer locked; unlock with `store.setLayer('ToggleLayer', 'walls', { locked: false })`), `createOfficeDoc()`.
- Every feature test should check undo (and redo where it matters), plus the locked-layer refusal.
- Before handing work over, run `yarn typecheck`, `yarn lint`, `yarn format:check`, `yarn test`, `yarn build`, and check UI changes in a browser.
- Conventions: TypeScript strict with `noUncheckedIndexedAccess`, no `any`; files under ~300 lines; comments explain *why*; colors from tokens; no new runtime dependencies without approval.
