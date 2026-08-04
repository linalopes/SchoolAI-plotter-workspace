# Plotter Workspace

An experimental creative technology interface for generative drawing, vector
preparation, and physical pen plotters.

**Conceived and developed by [Lina Lopes](https://linalopes.info/)** as part of
[School of Tomorrow's AI](https://schoolai.linalopes.info/).

**Try it online:**
[https://school-ai-plotter-workspace.vercel.app/](https://school-ai-plotter-workspace.vercel.app/)

Serial hardware access still requires a supported desktop browser (Chrome) and a
secure context. The hosted build is useful for exploring Generate, Prepare, and
Demo mode without a local install.

**Plotter Workspace is a working title.** The product name and authorship
metadata live in `src/lib/config.ts` so they can be changed in one place.

---

## Authorship

**Concept, interaction design, software architecture, and development:**  
[Lina Lopes](https://linalopes.info/)

Developed as part of
[School of Tomorrow's AI](https://schoolai.linalopes.info/).

School of Tomorrow's AI is the institutional and educational context. It is not
a substitute credit for personal authorship.

No software license has been declared yet. Authorship and licensing are
separate concepts.

---

## Current development state

The application is a working vertical slice for Cartesian GRBL XY plotters:

**Generate → Capture SVG → Prepare → Plot**  
and  
**Prepare → Import SVG → Prepare → Plot**

Both routes converge on an internal `PlotDocument` (millimetre paths, Y-up),
then share Prepare placement, machine-safe validation, G-code generation, and
GRBL streaming.

| Area | State |
| --- | --- |
| Application shell (Generate, Prepare, Machines, Guide) | Implemented |
| Generate: CodeMirror 6, sketch CRUD, browser LocalStorage | Implemented |
| Generate: Download .js + Download all sketches (.zip) | Implemented |
| Generate: sandboxed p5.js preview + p5.plotSvg capture | Implemented |
| Generate: single-file p5.js import + compatibility report | Implemented |
| Generate: logical canvas units vs physical output size | Implemented |
| Internal `PlotDocument` model | Implemented |
| External SVG import in Prepare → Documents | Implemented |
| SVG sanitization, units, viewBox, nested CTM transforms | Implemented |
| Import report + imported-document persistence (`svg-import`) | Implemented |
| Prepare: machine-coordinate placement, Fit / Center, preview | Implemented |
| Machine origin on media (paper may extend to negative X) | Implemented |
| G-code from placed PlotDocument | Implemented |
| Plot job streaming with Pause / Resume / Cancel | Implemented |
| Motion Idle barriers around pen transitions | Implemented |
| Machine profiles, Web Serial, Demo mode, GRBL 0.9 / 1.1 jog | Implemented |
| Layers UI (sidebar placeholder) | Not started — see Next milestones |
| Processing steps UI (sidebar placeholder) | Not started — see Next milestones |
| Raster tracing, centerline extraction, hatching | Not started |
| Polargraph support | Not started |

Nothing moves on its own. No motion command is sent when the page loads, when a
port is opened, when a connection is established, or when SVG is only captured
or imported. **Plot** always asks for confirmation before streaming.

---

## Two input workflows

### 1. p5.js route (Generate)

```text
Generate → Run → Capture SVG → PlotDocument → Prepare → Plot
```

Best for **line-based generative drawing** written as ordinary global-mode p5.

- p5 runs in an isolated iframe (`sandbox="allow-scripts"` only).
- Capture is enabled only after a successful **Run** of the current source.
- Generate never opens the serial port or builds G-code.
- Logical canvas units (`createCanvas`) and intended physical output (mm) are
  separate; Capture converts units to millimetres once.
- Prefer `noLoop()`, `noFill()`, and stroke-based drawing.
- WEBGL can be imported as text for editing but is not capturable for Prepare.
- Arbitrary multi-file p5 Editor projects, npm dependencies, and asset folders
  are not supported.

### 2. External SVG route (Prepare)

```text
Prepare → Documents → Import SVG
→ import report → PlotDocument
→ placement / validation → Plot
```

Best for path-oriented exports from tools such as **Turtletoy**, Inkscape,
Illustrator, and similar vector apps.

- Import lives in **Prepare**, not Generate.
- The browser reads a local `.svg` file; nothing is uploaded.
- You review an import report (and physical size when ambiguous) before a
  document is created.
- Prepare scale **1** preserves the interpreted imported physical size.
- Fit / Center are explicit follow-up actions — not applied automatically on import.

---

## Preparing an SVG before import

The plotter draws **paths**, not the original on-screen SVG rendering. Keep an
editable original; export a plotting copy when you change geometry.

### Real strokes (centerline)

A path with `fill="none"` and a stroke still has a **centerline**. The importer
keeps that path once. Visual `stroke-width` is ignored — a thick stroke is still
one pen pass.

### Expanded / outlined strokes

Operations such as **Outline Stroke**, **Expand**, or **Stroke to Path** remove
the centerline. The file then contains a **filled closed shape** that looks like
the thick stroke. The importer plots that **perimeter** as an outline. It does
not reconstruct the original centerline. That is expected behaviour, not a bug.

### Filled shapes

A filled closed shape becomes an **outline** (perimeter). The interior fill is
not reproduced and is not auto-hatched. A solid graphic may therefore plot as
several closed outlines.

### Recommended export habits

- Keep geometry as real strokes when you want a single centerline.
- Avoid expanding strokes unless you intentionally want the perimeter.
- Convert text to paths before export.
- Remove rasters, or trace them to vectors first.
- Remove filters, masks, and clipping when exact plot geometry matters.
- Prefer simple path geometry.
- Check the Import report and the Prepare preview before plotting.
- Verify interpreted physical size (mm / 96 DPI / custom) before confirming.
- Use Fit to safe area or Center in safe area after import when needed.

---

## PlotDocument

Internal model shared by Generate, Prepare, and the job streamer:

```ts
PlotPoint → PlotPath → PlotDocument
```

Millimetre geometry (Y-up), bounds, path separation, and a source tag
(`p5` | `svg-import` | …). Capture and SVG import both converge here. A light
optimiser drops empty / degenerate paths and merges duplicate consecutive
points while preserving drawing order.

Optional path metadata (for example source stroke/fill colour) may be stored for
future Layers work. **Colour does not yet create separate pens or layers.** All
paths in one document plot as one job.

### External SVG import architecture

```text
External SVG file
→ sanitize (strip scripts / handlers / external URLs)
→ parse dimensions, viewBox, CTM transforms
→ flatten to numeric paths
→ PlotDocument millimeters (Y-up)
→ existing Prepare → G-code → GRBL
```

Paper.js is **not** used for import. It may be reconsidered later for
interactive path editing; import → normalize → plot stays on the lightweight
pipeline.

| Area | Support |
| --- | --- |
| Geometry elements | `path`, `line`, `polyline`, `polygon`, `rect`, `circle`, `ellipse`, nested `g` |
| Path commands | M L H V C S Q T A Z (relative + absolute) |
| Transforms | translate, scale, rotate, matrix, skewX, skewY (nested CTM) |
| Units | mm, cm, in, pt, pc, px; unitless @ 96 DPI with warning |
| viewBox | minX / minY / width / height respected; `preserveAspectRatio` default + `none` (+ common meet/slice) |
| Physical size | Declared physical units preferred; else 96 DPI; editable when ambiguous |
| Strokes | Centerline kept; stroke width ignored |
| Fills | Closed filled shapes → outlines; interior not reproduced |
| Visibility | Basic inline `display` / `visibility` / zero opacity |
| Unsupported | Text, rasters, clips/masks (warned), external `use`, full CSS |
| Security | Sanitized source only persisted; Prepare never mounts raw SVG in the DOM |

**The Prepare preview shows numeric plot geometry, not the original SVG render.**
Fills, clipping, effects, and expanded strokes may therefore look different.

Representative fixtures: `src/lib/plot/svgImport/fixtures/`.

---

## Prepare

- Documents sidebar: **Import SVG**, list of **recent prepared documents**
- Layers and Processing steps: **placeholders** for future milestones
- Workspace preview from numeric paths (optional pen-up travel)
- Uniform scale, Position X/Y in **machine millimetres**, rotation 0° / 90° / 180° / 270°
- Fit to safe area / Center in safe area
- Import report before confirming an SVG
- Plot disabled until every transformed point fits the machine-safe rectangle

Recent captures and imported SVG documents (max 20) are stored locally in this
browser as working copies — not permanent project archives. An in-flight plot
job is never persisted as resumable.

### Default XY Plotter media model

| Quantity | Value |
| --- | --- |
| Physical A4 media | 297 × 210 mm |
| Machine origin on media | 30 mm from left edge, 0 mm from bottom |
| Paper in machine coordinates | X −30 … 267 mm, Y 0 … 210 mm |
| Safe machine area (5 mm margin) | X 5 … 262 mm, Y 5 … 205 mm |

- Prepare Position X/Y are machine coordinates (same as Manual Control / G-code).
- The full physical paper stays visible; part of it may sit at negative machine X.
- The application does **not** redefine GRBL work zero.
- Fit and Center target the **machine-safe** rectangle, not “page + 35 mm”.

---

## Plotting and GRBL synchronization

1. Prepare validates connection, document presence, workspace geometry, and
   safe-area fit.
2. G-code is generated from the transformed document and the active profile
   (absolute mm, pen up between paths, configured pen commands).
3. Confirmation shows document name, path count, lengths, bounds, and pen status.
4. Empty pen commands allow an explicit **dry run** (motion without pen up/down).
5. Streaming uses the GRBL command queue with Pause / Resume / Cancel.

Synchronization model (README detail):

- Normal commands wait for GRBL `ok` / `error` acknowledgements.
- Realtime status (`?`) bypasses the normal command queue.
- Motion Idle barriers wait for physical Idle around pen transitions and path
  travel — acknowledgement is not the same as motion completion.
- Failures keep diagnostics in Machines → Console.
- A late or missing status response is not automatically retried as motion,
  because physical position may be uncertain.

---

## Generate (detail)

- One sidebar: My sketches + Browse examples (no nested editor list).
- Sketches are **saved locally in this browser** (convenient working storage,
  not a permanent archive).
- Overflow menu: Rename, Duplicate, **Download .js**, Delete.
- Secondary action: **Download all sketches (.zip)** — one ordinary `.js` file
  per sketch plus `manifest.json` metadata inside
  `plotter-workspace-sketches-YYYY-MM-DD/`. Does not include machine profiles,
  serial state, or prepared documents. This is not a full workspace backup.
- Blank New sketch / Import p5.js… menu (single local `.js` file).
- Examples are immutable templates with static gallery previews under
  `public/example-previews/`.
- Selecting an ordinary sketch never runs it; click **Run**.
- Capture converts SVG into a `PlotDocument` and switches to Prepare.
- Local classic p5 / plotSvg builds from `public/vendor/` (synced by
  `scripts/sync-sketch-vendor.mjs`).

### Sketch style that plots well

Prefer `noLoop()`, `noFill()`, and stroke commands (`line`, `beginShape` /
`vertex`, `circle`, `ellipse`, `rect`). Filled p5 shapes do not become hatch
fills in the plotter capture path.

---

## Local data and backups

Plotter Workspace is local-first.

Sketches, recent prepared documents, machine profiles, and interface
preferences are stored in the browser. **User project data is not uploaded** by
the application to a backend or synchronized to the cloud.

Browser storage is intended for continuity between sessions, not as a permanent
archive. It may be lost if site data is cleared, another browser or computer is
used, or the application origin changes. Download important `.js` sketches or
download all sketches as a ZIP before clearing browser data or moving machines.

**Saved locally** = automatic browser storage.  
**Downloaded as a file** = an explicit portable copy on your computer.

### Sketch ZIP archive

```text
plotter-workspace-sketches-YYYY-MM-DD.zip
└── plotter-workspace-sketches-YYYY-MM-DD/
    ├── Sketch name.js
    ├── Another sketch.js
    └── manifest.json
```

Each `.js` file is the exact editable source. `manifest.json` stores ids, names,
filenames, origin, timestamps, and physical-output settings — not the source
text again.

**Export workspace backup** / **Import workspace backup** (complete restoreable
package) and plot-ready SVG export from Prepare remain future work. Until both
backup and restore exist, Plotter Workspace does not expose an unrestorable
JSON-only export as the main bulk download. Single-file **Import p5.js…**
already restores one `.js` sketch at a time.

Vendor libraries and external documentation links may still use the network;
that does not mean project data is uploaded.

---

## Requirements

- Node.js 20.19 or newer (Vite 8)
- Desktop Google Chrome for serial access
- A GRBL controller for real hardware (Demo mode otherwise)

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server on localhost |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run check` | `svelte-check` and TypeScript |
| `npm test` | Unit and integration tests |

---

## Why Chrome and localhost are required

Serial uses the [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API):

1. A Chromium browser that implements it (official support: desktop Google Chrome).
2. A secure context: HTTPS, or `localhost` in development.

When serial is unavailable, Generate, Prepare, and Guide still work; Demo mode
runs anywhere.

---

## Demo mode

1. Open **Machines → Connection**.
2. Tick **Demo mode**.
3. Click **Connect**.

Exercise Generate → Prepare → Plot or Import SVG → Plot without hardware.

---

## Connecting a GRBL XY plotter

1. Connect the Arduino-based controller over USB and power the machine.
2. **Close UGS or any other app using the serial port.**
3. Open **Machines**, select **XY Plotter**.
4. In **Workspace**, set media size, machine origin on media, optional insets,
   and safe margin. Defaults place machine X0 30 mm inside an A4 sheet.
5. Connect at 115200 baud; confirm GRBL 0.9 vs 1.1 jog protocol.
6. Jog **1 mm** in Manual Control before larger moves.
7. Configure pen commands in **Pen**, then plot from Prepare.

### Pen commands

There is no universal pen up/down. Defaults ship empty. Presets only fill
fields as starting points. Empty commands offer a dry-run path rather than
guessing hardware values.

### Safety

- Start with very small jog distances.
- Keep hands and cables away from moving parts.
- Be prepared to cut machine power.
- **Pause** is a feed hold, not a physical emergency stop.
- Plot always requires explicit Start after confirmation.

---

## Architecture

```
p5 sketch → p5.plotSvg → SVG normaliser → PlotDocument
  → Prepare transform → G-code → GRBL queue / job streamer

External SVG → sanitize / import → PlotDocument
  → (same Prepare → G-code → GRBL path)
```

```
src/
  App.svelte
  main.ts
  app.css
  lib/
    config.ts
    brand/tokens.css
    components/                  Shell UI
    sketches/                    Sketch model, examples, LocalStorage store
    generate/components/         CodeMirror editor, preview panel
    p5/                          Sandboxed iframe sketch runtime + plotSvg capture
    plot/                        PlotDocument, SVG parse/import, transform, G-code
    prepare/components/          Workspace preview, import modal, confirm, job bar
    jobs/plotJob.ts              Single active plot job streamer
    serial/                      Transport + Web Serial + Demo simulator
    grbl/                        Parser, client queue, jog, stores
    machines/                    Profiles, actions, Machines sections
    guide/content.ts
    stores/
    utils/
  views/                         Generate, Prepare, Machines, Guide
```

### State persistence

Persisted locally in the browser (session continuity, not a permanent archive):
last tab, machine profiles, sketches, PlotDocuments (incl. svg-import metadata),
Prepare placement, interface preferences. User project data is not uploaded by
the application.

Not persisted: live serial connection, “connected” state, or an active plot job
as if it could safely resume after reload.

---

## Testing

```bash
npm test
```

Coverage includes GRBL parsing/client behaviour, serial line assembly, profile
sanitisation, SVG → PlotDocument (capture and import), Prepare transforms,
machine-space media placement, motion Idle barriers, and G-code generation.

---

## Brand

Follows the [School of Tomorrow's AI brand kit](https://linalopes.github.io/SchoolAI-brand-kit/).
Tokens live in `src/lib/brand/tokens.css`.

---

## Explicitly out of scope (current)

- Raster image tracing / automatic bitmap-to-vector
- Automatic centerline extraction from outlined or filled shapes
- Automatic hatching of fills
- Interactive layer editing and automatic multi-pen sequencing
- Advanced path editing, join/split UI, boolean operations
- Export / Import workspace backup (complete restoreable package)
- Plot-ready SVG export from Prepare
- Polargraph support
- Full multi-job queue and resumable jobs after refresh
- Cloud sync / backend services
- Automatic unsafe motion recovery / blind replay after uncertain position

Extension points exist on `PlotDocument` (including optional colour metadata),
but Layers and Processing are not built yet.

---

## Next milestones

1. **Layers and multi-pen plotting** — group by source colour, selective
   plotting, visibility, plot one layer at a time with pauses for pen changes,
   same machine coordinates between passes. Applies to any PlotDocument source
   (p5, Turtletoy, Illustrator/Inkscape, future).
2. **Filled-shape and path processing** — outline / ignore / hatch fills,
   approximate centerline extraction, simplify, path ordering. Centerline from
   expanded strokes is approximate and will need review; Paper.js may be
   reconsidered for interactive editing, not for basic import.
3. **Export / Import workspace backup** — paired backup and restore for
   sketches, prepared documents, placement, machine profiles, and selected
   preferences. Not exposed until both sides exist.
4. **Plot-ready SVG export** — export the numeric Prepare preview paths as a
   normalized SVG (may differ from an original import).
5. **Stronger long-job recovery and diagnostics** — richer Console evidence and
   recovery without unsafe automatic replay of uncertain motion.
6. **Polargraph** — machine profile, kinematics, workspace model, and serial
   control.
