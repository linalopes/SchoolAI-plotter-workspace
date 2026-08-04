import { APP_CONFIG } from '../config';

/**
 * Guide content as data.
 *
 * Keeping the copy out of the markup makes it easy to review as prose, and
 * later to translate or move into a documentation site without touching the
 * rendering code.
 */

export type GuideBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'list'; items: string[] }
  | { type: 'callout'; text: string; tone?: 'default' | 'warn' }
  | { type: 'faq'; items: Array<{ question: string; answer: string }> }
  | { type: 'link'; text: string; href: string };

export interface GuideChapter {
  id: string;
  label: string;
  title: string;
  intro: string;
  blocks: GuideBlock[];
}

export const GUIDE_CHAPTERS: GuideChapter[] = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    title: 'Getting started',
    intro: `${APP_CONFIG.productName} follows Generate → Prepare → Plot. You can start from p5.js code or from an external SVG file.`,
    blocks: [
      {
        type: 'list',
        items: [
          'Generate — write or import a p5.js sketch, Run it, and Capture SVG.',
          'Prepare — import an SVG and/or place a PlotDocument on the machine workspace.',
          'Plot — confirm the job, then stream G-code to a GRBL XY plotter.',
          'Machines — connect hardware, jog, configure pen commands and workspace.',
        ],
      },
      { type: 'heading', text: 'Quick path from p5.js' },
      {
        type: 'steps',
        items: [
          'Open Generate and load an example or create a sketch.',
          'Click Run, then Capture SVG.',
          'In Prepare, Fit or Center if needed, then Plot → Start plot.',
        ],
      },
      { type: 'heading', text: 'Quick path from an SVG file' },
      {
        type: 'steps',
        items: [
          'Open Prepare → Documents → Import SVG.',
          'Review the import report (and physical size if asked), then Import SVG.',
          'Check the Prepare preview — that is what the machine will draw.',
          'Fit or Center if needed, connect in Machines, then Plot.',
        ],
      },
      {
        type: 'callout',
        text: 'Nothing moves on its own. The application never sends a motion command when it loads, when a connection opens, or when you only capture or import a drawing.',
      },
    ],
  },

  {
    id: 'generate-basics',
    label: 'Generate Basics',
    title: 'Generate basics',
    intro: 'Generate is a lightweight p5.js environment for line-based plotter work — not a full IDE.',
    blocks: [
      {
        type: 'list',
        items: [
          'My sketches live in the left sidebar only.',
          'Sketches are saved locally in this browser — convenient working storage, not a permanent archive.',
          'Download .js for one sketch, or Download all sketches (.zip) for a folder of ordinary .js files plus a metadata manifest.',
          'Built-in examples stay templates until Use example creates one editable copy.',
          'Selecting an ordinary sketch never runs it; click Run.',
          'Capture SVG stays disabled until the current source has completed a successful run.',
          'p5 runs in an isolated iframe. Generate does not talk to the serial port.',
          'Logical canvas units and physical output size (mm) are separate — see Canvas units and physical size.',
        ],
      },
      {
        type: 'paragraph',
        text: 'Prefer noLoop(), noFill(), and stroke-based drawing (line, beginShape/vertex, circle, ellipse, rect). Line-based 2D sketches are the best fit. WEBGL can be edited after import but cannot be captured for Prepare.',
      },
      {
        type: 'callout',
        text: 'Capture does not generate G-code. Generate only produces a PlotDocument. G-code is created later when you confirm Plot.',
      },
    ],
  },

  {
    id: 'importing-p5',
    label: 'Importing p5.js',
    title: 'Importing p5.js',
    intro:
      'Generate can import a single local .js file that contains one p5.js sketch. Import never runs the code automatically.',
    blocks: [
      {
        type: 'list',
        items: [
          'Import accepts one local .js file only — not ZIP projects, HTML, CSS, asset folders, or npm dependencies.',
          'Imported sketches appear in My sketches like any other editable sketch.',
          'A compatibility report estimates import, preview, and plot-capture support separately.',
          'Imported code never runs until you click Run.',
          'External assets and libraries are not included with the .js file.',
        ],
      },
      {
        type: 'callout',
        text: 'The import report is a static estimate. The sandboxed iframe remains the real execution boundary.',
      },
    ],
  },

  {
    id: 'canvas-units-physical-size',
    label: 'Canvas units and physical size',
    title: 'Canvas units and physical size',
    intro:
      'createCanvas(400, 400) creates a 400 × 400 logical p5 canvas. It does not inherently define millimetres.',
    blocks: [
      {
        type: 'list',
        items: [
          'Logical canvas size is reported in p5 units after Run (or from a static createCanvas literal when known).',
          'Generate assigns an explicit physical output size in millimetres, with locked aspect ratio.',
          'Existing sketches keep Preserve current size (legacy fit-to-A4) until you set a custom size.',
          'Capture converts p5 units into millimetres once onto the PlotDocument.',
          'Prepare scale 1 preserves that Generate physical size; Fit/Center/scale change placement afterward.',
        ],
      },
      {
        type: 'paragraph',
        text: 'Example: Generate output 180 × 180 mm with Prepare scale 0.75 yields a final plotted size of 135 × 135 mm.',
      },
      {
        type: 'callout',
        text: 'Do not confuse canvas units with machine coordinates. Machine placement happens in Prepare and Plot.',
      },
    ],
  },

  {
    id: 'importing-svg',
    label: 'Importing SVG files',
    title: 'Importing SVG files',
    intro:
      'Prepare can import a local SVG from Turtletoy, Inkscape, Illustrator, Figma exports, and similar tools.',
    blocks: [
      {
        type: 'list',
        items: [
          'Import SVG lives in Prepare → Documents — files never go through Generate.',
          'You review an import report before a PlotDocument is created.',
          'The Prepare preview shows numeric paths the plotter will follow, not the original SVG appearance.',
          'SVG is read and sanitized in the browser; nothing is uploaded.',
          'Path-oriented exports (for example Turtletoy line drawings) usually import with few or no warnings.',
        ],
      },
      {
        type: 'callout',
        text: 'After import, Prepare scale 1 preserves the interpreted physical size. Use Fit or Center when you want the drawing inside the machine safe area.',
      },
    ],
  },

  {
    id: 'preparing-svg',
    label: 'Preparing an SVG before import',
    title: 'Preparing an SVG before import',
    intro:
      'What you export strongly affects what the plotter draws. Keep an editable original; export a plotting copy when you change geometry.',
    blocks: [
      { type: 'heading', text: 'Terms' },
      {
        type: 'list',
        items: [
          'Stroke — a path drawn with a stroke (often fill="none"). It still has a centerline.',
          'Centerline — the single path the pen tip follows when a real stroke exists.',
          'Expanded / outlined stroke — Outline Stroke, Expand, or Stroke to Path replaced the centerline with a filled shape.',
          'Filled shape — a closed region with a fill; the importer keeps the perimeter (outline), not the solid interior.',
          'Outline — the boundary of a closed shape, plotted as a closed path.',
          'Hatch — filling an area with many parallel pen strokes (not available yet).',
          'PlotDocument — the internal millimetre path list Prepare and Plot use.',
        ],
      },
      { type: 'heading', text: 'Real strokes vs expanded strokes' },
      {
        type: 'paragraph',
        text: 'A path with fill="none" and a stroke still contains a centerline. The plotter follows that path once and ignores visual stroke width.',
      },
      {
        type: 'paragraph',
        text: 'If you convert the stroke with Outline Stroke / Expand / Stroke to Path, the centerline is gone. The importer plots the outer boundary as an outline. That is expected — the importer is not reconstructing the old centerline.',
      },
      { type: 'heading', text: 'Filled shapes' },
      {
        type: 'paragraph',
        text: 'Filled closed shapes are imported as outlines. The interior fill is not reproduced and is not turned into hatching. A solid graphic may therefore appear as several outlines on the plotter.',
      },
      { type: 'heading', text: 'Recommended workflow' },
      {
        type: 'list',
        items: [
          'Keep paths as strokes when you want a single plotted centerline.',
          'Avoid expanding strokes unless perimeter plotting is intentional.',
          'Convert text to paths before import.',
          'Remove raster images, or trace them to vectors in the source app first.',
          'Remove filters, masks, and clipping when exact plot geometry matters.',
          'Prefer simple path geometry.',
          'Check the Import report, then trust the Prepare preview.',
          'Verify the interpreted physical size before confirming import.',
          'Use Fit to safe area or Center in safe area after import when needed.',
        ],
      },
      {
        type: 'callout',
        text: 'Do not overwrite your only editable master file. Export a plotting copy after destructive outline or expand steps.',
        tone: 'warn',
      },
    ],
  },

  {
    id: 'svg-centerlines',
    label: 'Centerlines and stroke width',
    title: 'Centerlines and stroke width',
    intro: 'When a true stroked path still exists, the pen follows its centerline.',
    blocks: [
      {
        type: 'list',
        items: [
          'Stroke width is ignored — a wide stroke is still one path.',
          'Stroke width is ignored only when that real stroke geometry remains in the file.',
          'If the stroke was expanded into a filled shape, you get the perimeter instead (see Preparing an SVG before import).',
        ],
      },
    ],
  },

  {
    id: 'svg-fills-text-images',
    label: 'Fills, text, images, and colour',
    title: 'Fills, text, images, and colour',
    intro: 'Import focuses on line geometry for pen plotting.',
    blocks: [
      {
        type: 'list',
        items: [
          'Filled shapes are imported as outlines. The interior fill is not reproduced.',
          'Hatching is not applied on import — that is a future Processing feature.',
          'Convert text to paths before exporting.',
          'Raster images are not imported; tracing is a separate future feature.',
          'Source colours may be stored as path metadata when present, but they do not create layers or pen changes yet.',
          'All paths in one document plot as one job with the active pen settings.',
        ],
      },
      {
        type: 'paragraph',
        text: 'For multi-colour work today, use separate exports or separate imported documents and keep the paper and machine work zero fixed between passes. Automatic colour separation and pen-change sequencing are planned for Layers — they are not available yet. Registration is never guaranteed if the sheet or work zero moves.',
      },
    ],
  },

  {
    id: 'svg-dimensions',
    label: 'SVG dimensions',
    title: 'SVG dimensions',
    intro: 'Physical units become PlotDocument millimetres before Prepare placement.',
    blocks: [
      {
        type: 'list',
        items: [
          'Physical units (mm, cm, in, pt, pc) are preserved when present.',
          'px and unitless SVGs use a visible 96 DPI interpretation by default.',
          'Ambiguous files (viewBox only, or percentage sizes) ask you to confirm or edit a physical size.',
          'Prepare scale 1 preserves that imported physical size; Fit/Center are separate actions.',
        ],
      },
      {
        type: 'callout',
        text: 'SVG import never applies machine origin, media placement, or safe margin. Those stay in Prepare.',
      },
    ],
  },

  {
    id: 'plotting-workflow',
    label: 'Plotting Workflow',
    title: 'Plotting workflow',
    intro: 'Generate → Capture → Prepare → Plot, or Import SVG → Prepare → Plot.',
    blocks: [
      {
        type: 'steps',
        items: [
          'Create a PlotDocument (Capture from Generate, or Import SVG in Prepare).',
          'Adjust scale, position, and rotation in Prepare.',
          'Use Fit to safe area / Center in safe area so the drawing stays inside the machine’s safe plotting rectangle.',
          'Connect the machine in Machines if you have not already.',
          'Click Plot, read the confirmation summary, then Start plot.',
          'Use Pause, Resume, or Cancel while the job streams.',
        ],
      },
      {
        type: 'callout',
        text: 'Only one plot job runs at a time. Jobs are not resumed after a page reload.',
        tone: 'warn',
      },
    ],
  },

  {
    id: 'page-drawable-safe',
    label: 'Machine origin and media position',
    title: 'Machine origin and media position',
    intro:
      'Prepare and G-code use machine coordinates. Physical media may extend before machine zero.',
    blocks: [
      {
        type: 'list',
        items: [
          'Machine coordinates match Manual Control and GRBL (axis origin at the physical limit).',
          'Physical media size is the sheet (default XY Plotter: A4 landscape 297 × 210 mm).',
          'Media placement says where machine 0,0 sits on that sheet — it does not rewrite the controller origin.',
          'Prepare Position X/Y are machine millimetres.',
          'Fit / Center / validation / G-code use the safe rectangle in machine coordinates.',
          'The application does not silently crop drawings that leave the safe area — Plot stays disabled until they fit.',
        ],
      },
      {
        type: 'paragraph',
        text: 'Default XY Plotter example: physical paper 297 × 210 mm; machine origin 30 mm from the left edge and 0 mm from the bottom. Paper in machine coordinates spans X −30…267 mm and Y 0…210 mm. With a 5 mm safe margin, the safe machine area is X 5…262 mm and Y 5…205 mm. The left strip of paper is visible but unreachable (negative machine X).',
      },
      {
        type: 'callout',
        text: 'Controller travel ($130 / $131) is read-only firmware data. It is not the same as media size or the safe plotting area.',
      },
    ],
  },

  {
    id: 'future-layers',
    label: 'Future: Layers',
    title: 'Future: Layers and multi-pen plotting',
    intro:
      'Prepare already shows a Layers sidebar entry. It is a placeholder for a future milestone — not available yet.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Planned Milestone 3.2 may include grouping paths by source colour, manual layer organisation, visibility toggles, enable/disable for plotting, plot one layer at a time, pause between layers for pen changes, preserved machine coordinates between passes, and optional colour labels.',
      },
      {
        type: 'paragraph',
        text: 'Layers should work for any PlotDocument: p5 capture, Turtletoy SVG, Illustrator or Inkscape SVG, and future sources.',
      },
      {
        type: 'callout',
        text: 'Today, colour metadata may be stored on paths but does not change plotting. Multi-colour work requires separate documents or careful manual repeats with a fixed work zero.',
      },
    ],
  },

  {
    id: 'future-processing',
    label: 'Future: Processing',
    title: 'Future: Filled-shape and path processing',
    intro:
      'Processing steps in the Prepare sidebar is a placeholder for a future milestone.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Planned Milestone 3.3 may offer: use existing paths; outline or ignore filled shapes; hatch filled shapes; approximate centerline extraction; simplify; path ordering; join or split.',
      },
      {
        type: 'list',
        items: [
          'Centerline extraction is not implemented today.',
          'Recovering a centerline from an outlined or filled shape is approximate — it may need medial-axis / skeleton algorithms, cleanup, and visual review.',
          'Paper.js alone does not magically reconstruct centerlines; it may be reconsidered later for interactive editing, not for basic import.',
        ],
      },
    ],
  },

  {
    id: 'supported-sketch-features',
    label: 'Supported Sketch Features',
    title: 'Supported sketch features',
    intro: 'p5.plotSvg capture works best with stroke-based drawing commands.',
    blocks: [
      {
        type: 'list',
        items: [
          'line()',
          'beginShape() / vertex() / endShape()',
          'circle(), ellipse(), rect()',
          'arc() when capture produces path geometry',
          'noFill() — filled p5 shapes are not a reliable plot target',
        ],
      },
      {
        type: 'paragraph',
        text: 'Keep examples modest and static. Animation-only effects, image filters, and fill-heavy artwork are a poor fit for pen plotting.',
      },
    ],
  },

  {
    id: 'keeping-work',
    label: 'Keeping your work',
    title: 'Keeping your work',
    intro:
      'Browser storage is convenient working storage. Downloaded files are portable copies. Neither replaces a deliberate backup strategy.',
    blocks: [
      {
        type: 'heading',
        text: 'Three kinds of data',
      },
      {
        type: 'paragraph',
        text: 'Sketches — editable creative-code sources in Generate.',
      },
      {
        type: 'heading',
        text: 'Download one sketch',
      },
      {
        type: 'paragraph',
        text: 'Download .js saves an ordinary JavaScript source file. Open it in a code editor, or bring it back with Import p5.js….',
      },
      {
        type: 'heading',
        text: 'Download all sketches',
      },
      {
        type: 'paragraph',
        text: 'Download all sketches (.zip) creates a folder archive with one .js file per sketch and a manifest.json of Plotter Workspace metadata (ids, names, origin, timestamps, physical-output settings). The manifest does not duplicate the JavaScript source.',
      },
      {
        type: 'paragraph',
        text: 'Edit or reuse the .js files directly. The manifest is mainly for metadata and a future archive restore — it is not required for day-to-day work.',
      },
      {
        type: 'paragraph',
        text: 'Prepared documents — recent plot-ready geometry from p5 captures or imported SVG files. These are working copies stored locally in this browser (up to 20 recent documents), not the primary creative source.',
      },
      {
        type: 'paragraph',
        text: 'Original source files — your .js files, Turtletoy exports, Illustrator / Inkscape documents, and original SVGs. Keep these separately on your own drive or backup system.',
      },
      {
        type: 'heading',
        text: 'Saved locally vs downloaded as a file',
      },
      {
        type: 'paragraph',
        text: 'Saved locally means the work is automatically stored in this browser. It is not a permanent backup, is not synchronized to the cloud, and may be lost if site data is cleared, a different browser or computer is used, or the application address changes.',
      },
      {
        type: 'paragraph',
        text: 'Downloaded as a file means you explicitly save a .js sketch or a ZIP of sketches to your computer. Renaming a downloaded file does not rename the sketch inside the application.',
      },
      {
        type: 'callout',
        text: 'Your sketches and prepared documents stay in this browser unless you explicitly download or export them. The application does not upload project data to School of Tomorrow’s AI.',
      },
      {
        type: 'heading',
        text: 'Where local data lives',
      },
      {
        type: 'list',
        items: [
          'Associated with the current browser, browser profile, computer, and application origin (URL).',
          'May be removed by clearing site data, resetting browser storage, private browsing, cleanup tools, changing the application origin, or uninstalling a local build.',
          'Browser storage is a useful continuity tool between sessions — not secure archival storage.',
        ],
      },
      {
        type: 'heading',
        text: 'Future: Export / Import workspace backup',
      },
      {
        type: 'paragraph',
        text: 'A paired Export workspace backup and Import workspace backup milestone is planned for a complete restoreable package (sketches, prepared documents, placement, profiles, and selected preferences). Until both sides exist, Plotter Workspace does not present an unrestorable JSON file as the main export-all action.',
      },
      {
        type: 'heading',
        text: 'Future exports (not available yet)',
      },
      {
        type: 'list',
        items: [
          'Plot-ready SVG export from Prepare — numeric preview paths as normalized SVG (may differ from an original import: flattened transforms, omitted unsupported content, fills as outlines).',
          'Export workspace backup / Import workspace backup — complete restoreable package.',
        ],
      },
    ],
  },

  {
    id: 'limitations',
    label: 'Limitations',
    title: 'Current limitations',
    intro: 'These features are intentionally deferred or restricted.',
    blocks: [
      {
        type: 'list',
        items: [
          'Complete p5 Editor project import (ZIP, HTML, multi-file, assets) is not supported.',
          'WEBGL sketches can be imported as text but cannot be captured for Prepare.',
          'SVG text, rasters, clips/masks, and external references are limited or unsupported.',
          'Filled shapes import as outlines only — no automatic hatching or centerline extraction.',
          'Layers and Processing steps UIs are placeholders.',
          'No automatic multi-pen sequencing.',
          'Export / Import workspace backup is not available yet.',
          'No Polargraph support yet.',
          'No multi-job queue and no resumable job after refresh.',
        ],
      },
    ],
  },

  {
    id: 'browser-requirements',
    label: 'Browser Requirements',
    title: 'Browser requirements',
    intro: 'Serial access is a browser capability, and not every browser has it.',
    blocks: [
      {
        type: 'list',
        items: [
          'Official support: desktop Google Chrome on macOS, Windows, Linux, and ChromeOS.',
          'Serial requires a secure context: HTTPS, or localhost during development.',
          'The browser asks you to pick a serial device — permission is never automatic.',
          'Generate, Prepare, and Guide remain usable without serial; Demo mode works everywhere.',
        ],
      },
    ],
  },

  {
    id: 'connecting',
    label: 'Connecting the XY Plotter',
    title: 'Connecting the XY plotter',
    intro: 'The order of these steps matters, particularly closing other software first.',
    blocks: [
      {
        type: 'steps',
        items: [
          'Connect the Arduino-based controller to the computer through USB.',
          'Power the machine according to its own hardware requirements.',
          'Close Universal Gcode Sender, or any other application using the serial port.',
          'Open Machines and select the XY Plotter profile.',
          'Review Workspace (media size, machine origin on media, safe margin).',
          'Open Connection → Choose serial port → Connect at 115200 baud.',
          'Wait for the GRBL startup banner in the Console.',
          'Confirm protocol (GRBL 0.9 legacy jog vs GRBL 1.1 $J=).',
          'Send a 1 mm jog in Manual Control before larger moves.',
          'Configure pen commands in Pen before testing the pen.',
        ],
      },
      {
        type: 'callout',
        text: 'A serial port can only be held by one program at a time. If UGS is open, the browser cannot open the same port.',
        tone: 'warn',
      },
    ],
  },

  {
    id: 'grbl-basics',
    label: 'GRBL Basics',
    title: 'GRBL basics',
    intro: 'A short model of what is happening between the browser and the machine.',
    blocks: [
      {
        type: 'list',
        items: [
          'GRBL is firmware on the controller. It interprets G-code and drives steppers.',
          'Normal commands wait for ok / error acknowledgements, one at a time.',
          'Realtime characters bypass the queue: pause (!), resume (~), status (?), soft reset.',
          'During plots, the application also waits for physical Idle around pen transitions — acknowledgement is not the same as finished motion.',
          'Machine position (MPos) is from the machine origin; work position (WPos) is from your work zero.',
        ],
      },
      {
        type: 'callout',
        text: 'Status reports use "?". That is how coordinates in the interface stay current. Status queries do not wait in the normal command line queue.',
      },
    ],
  },

  {
    id: 'troubleshooting',
    label: 'Troubleshooting',
    title: 'Troubleshooting',
    intro: 'Common first-connection, import, and plot issues.',
    blocks: [
      {
        type: 'faq',
        items: [
          {
            question: 'Web Serial is unavailable',
            answer:
              'Use desktop Google Chrome over HTTPS or on localhost. Demo mode works regardless.',
          },
          {
            question: 'The sketch fails to run',
            answer:
              'Read the error under the preview. Fix syntax or keep p5 calls inside setup/draw, then Run again.',
          },
          {
            question: 'Capture SVG returns no paths',
            answer:
              'Draw with stroke-based commands and noFill(). Filled shapes alone are a poor capture target.',
          },
          {
            question: 'SVG plots as double outlines / thick bands become outlines',
            answer:
              'The stroke was probably expanded (Outline Stroke / Expand / Stroke to Path) or exported as a filled shape. Return to the source app, keep a real stroke if you want a single centerline, and re-export. Keep your editable original.',
          },
          {
            question: 'SVG physical size looks unexpected',
            answer:
              'Open the Import report: check width, height, units, and viewBox. Edit physical size when the source is percentage-based or ambiguous. Scale 1 in Prepare preserves the interpreted imported size.',
          },
          {
            question: 'Text is missing after import',
            answer:
              'Convert text to paths in Illustrator, Inkscape, or your source tool before exporting SVG.',
          },
          {
            question: 'Images are missing after import',
            answer:
              'Raster images are not imported. Trace or redraw them as vector paths first.',
          },
          {
            question: 'Plot says the drawing does not fit',
            answer:
              'Use Fit to safe area or Center in safe area. Geometry must stay inside the machine safe rectangle (for the default XY Plotter, roughly X 5–262 and Y 5–205 mm). The application does not crop drawings.',
          },
          {
            question: 'Plot stops before completion',
            answer:
              'Open Machines → Console. Enable status logging when diagnosing. Copy the last TX/RX lines. Do not reset work zero before preserving evidence when possible. Reconnect only when necessary. Do not blindly increase timeouts — a late status may mean uncertain physical position.',
          },
          {
            question: 'Multi-colour SVG',
            answer:
              'Automatic colour layers and pen-change sequencing are planned (Layers), not implemented. For now, use separate exports or separate imported documents and keep the paper and work zero fixed between passes.',
          },
          {
            question: 'Pen commands are missing',
            answer:
              'Configure them in Machines → Pen. Empty commands can still offer a dry motion pass without pen up/down.',
          },
          {
            question: 'The serial port is already in use',
            answer:
              'Close UGS, the Arduino IDE serial monitor, or other plotter software, then try again.',
          },
          {
            question: 'The machine reports Alarm',
            answer:
              'Use Unlock ($X) or Home ($H) as appropriate for your machine before jogging or plotting.',
          },
          {
            question: 'The jog controls are disabled',
            answer:
              'Jogging is blocked while disconnected, connecting, pending a command, or in Alarm / Run / Hold / Home. Manual Control shows the reason.',
          },
        ],
      },
    ],
  },

  {
    id: 'safety',
    label: 'Safety',
    title: 'Safety',
    intro: 'A pen plotter is small, but it is still a machine that moves under power.',
    blocks: [
      {
        type: 'list',
        items: [
          'Start with very small jog distances.',
          'Keep hands, hair, and cables away from moving parts.',
          'Know where machine power is before you start.',
          'Software Pause is a feed hold, not a physical emergency stop.',
          'Do not test unknown pen commands without checking what the hardware does.',
          'Plot always asks for confirmation before streaming motion.',
        ],
      },
      {
        type: 'callout',
        text: 'No button in this interface is called Emergency Stop, because no software button can be one.',
        tone: 'warn',
      },
    ],
  },

  {
    id: 'about',
    label: 'About and credits',
    title: 'About and credits',
    intro: `${APP_CONFIG.productName} is an experimental creative technology project conceived, designed, and developed by ${APP_CONFIG.author.name} as part of ${APP_CONFIG.organization.name}.`,
    blocks: [
      {
        type: 'paragraph',
        text: 'It explores a shared interface for generative drawing, external vector files, machine preparation, and physical pen plotters — combining interaction design, creative coding, vector processing, and physical-machine control.',
      },
      {
        type: 'paragraph',
        text: `${APP_CONFIG.organization.name} is the project’s institutional and educational context. ${APP_CONFIG.author.name} is the person who conceived and developed the software. These roles are not interchangeable.`,
      },
      {
        type: 'link',
        text: APP_CONFIG.author.name,
        href: APP_CONFIG.author.url,
      },
      {
        type: 'link',
        text: APP_CONFIG.organization.name,
        href: APP_CONFIG.organization.url,
      },
      {
        type: 'paragraph',
        text: `${APP_CONFIG.productName} is a working title. Nothing here is a final product name.`,
      },
      {
        type: 'paragraph',
        text: 'It is aimed at artists, creative technologists, educators, and developers who want generative or vector work on a physical GRBL XY plotter from the browser.',
      },
      { type: 'heading', text: 'Implemented now' },
      {
        type: 'list',
        items: [
          'Generate with p5.js, Capture SVG, physical output size, Download .js, and Download all sketches (.zip).',
          'External SVG import in Prepare with reports, units, transforms, and sanitization.',
          'Machine-origin-on-media workspace, Fit / Center, confirmed plot streaming.',
          'Web Serial / Demo mode, GRBL 0.9 and 1.1 jogging, motion Idle barriers.',
          'Local-first browser storage for sketches and recent prepared documents (not a cloud archive).',
        ],
      },
      { type: 'heading', text: 'Next milestones' },
      {
        type: 'list',
        items: [
          'Layers and multi-pen plotting.',
          'Filled-shape and path processing (hatch, approximate centerline, simplify).',
          'Export / Import workspace backup.',
          'Plot-ready SVG export from Prepare.',
          'Stronger long-job recovery and diagnostics.',
          'Polargraph machine support.',
        ],
      },
      {
        type: 'paragraph',
        text: 'No software license has been declared yet. Authorship and licensing are separate concepts.',
      },
    ],
  },
];
