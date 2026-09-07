# Interactive Timer guide

The learning area is served at `/guide`. The five lessons have direct URLs:
`/guide/create`, `/guide/build`, `/guide/run`, `/guide/share`, and `/guide/zoom`.
The searchable reference is `/guide#button-reference`.

## Practice and isolation

`/guide/practice` renders the existing `LiveConsole` against React state only.
`?mode=panel` starts at the panel. `?mode=build` opens the existing agenda editor.
Practice does not mount `useControllerEvent`, does not create a session, and does
not save to localStorage, Supabase, or controller APIs. The fixture has no viewer
or Zoom token. Real invitation/password/deletion controls are not mounted.
Speaker view opens a local preview; copying a speaker link reports that practice
has no public link. Sharing and Zoom lessons explicitly label their simulations.

The practice lesson advances after its expected event state transition succeeds.
Replay resets the fixture; Skip guidance leaves the sample controls available.
Reloading discards the sample. The single-speaker and panel lessons use the same
timer handlers, clock derivation, and render components as the real control room.

## Content and contextual help

Edit lesson steps and button descriptions in `src/lib/guide.ts`.
Keep labels aligned with actual controls, including Start speaker/Pause speaker
on a panel, and the distinction between creating an event and editing its agenda.

`ContextHelp` is available on home, creation, editor, control, and Zoom screens.
Stable `data-help` targets connect descriptions to controls. Show me where opens
containing details elements, scrolls to a target, and outlines it without clicking
it. The help card shrinks after locating a control so it remains visible on mobile. Missing targets get an explanation (for example, panel-only controls or a
run-of-show hidden by Focus mode). Escape/Close clears the highlight and restores
focus to Help. Lessons open in a new tab so help navigation preserves live work.

## Verified screenshots

Eight unedited JPEG screenshots are included in `public/guide/`. They were captured
from a local production build on September 6, 2026, at a 1280px desktop viewport.
The home and creation forms are empty; editor and control-room captures use sample
event data. The capture-only preview supplied a local fixture through its event
endpoint; its page components, styles, and controls were the real app. That fixture
endpoint is not part of this implementation and must never be deployed.

| Asset | Actual screen |
| --- | --- |
| home.jpg | Home, Create an event tab |
| create.jpg | New event access form |
| import.jpg | Open CSV import dialog (viewport capture; scroll inside for examples) |
| editor.jpg | Event agenda editor with sample data |
| control.jpg | Single-speaker control room with sample data |
| panel.jpg | Panel control room with sample data |
| sharing.jpg | Expanded Zoom code and Event access, sample data |
| zoom-browser.jpg | Timer's Zoom page in browser preview |

The all-zero Zoom code is synthetic. No real passwords, invitation links, or usable
pairing codes appear. The Zoom capture shows the browser preview with publishing
disabled; it does not show the in-meeting indicator. In-meeting visual verification
requires a real supported Zoom meeting and remains outside this capture set.

`src/lib/guide-screenshots.ts` records dimensions, captions, and percentage-based
hotspots. The lesson selects the relevant screen as the reader advances. Readers
can switch screenshots, select explanations, hide markers, enlarge the screenshot,
or open its original file. Mobile keeps the explanations below the image.
`next/image` uses `unoptimized` so the original captured bytes are served without
image transformation; annotations are separate HTML and never baked into images.
`docs/guide-screenshot-provenance.json` records the exact asset hashes and sizes.

When the app UI changes, recapture its actual screens with sample data, inspect each
image, update hotspot positions and dimensions, and refresh the provenance manifest.
Do not recreate or retouch screenshots to approximate the UI.

Browser checks covered the guide at phone, tablet, and desktop widths, screenshot
selection and marker hiding, enlargement and Escape/focus return, and the real
practice sequence (start, +15 seconds, pause, next). Reduced-motion preferences
disable the help animation and smooth scrolling.

## Validation

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
`src/components/guide/guide.test.tsx` covers lesson navigation, reference search,
local practice isolation, progression, panel behavior, contextual help, and the
sharing/Zoom distinction. The existing control-room and editor suites continue to
exercise the shared controls.

No deployment or database migration is needed for the source change itself.
Deploy through the project's existing hosting workflow when ready to publish.
