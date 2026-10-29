# ThinkBoard AI — Progress

Deadline: public web demo by **November 4, 2026, 9:00 PM ET**.

## Phase 1 — Foundation (done 2026-10-28)

### Built
- npm workspaces monorepo: `client` (Expo SDK 58 + Expo Router), `server` (Fastify 5), `shared` (Zod schemas + geometry).
- **Whiteboard:** freehand mouse drawing on a React Native Skia canvas in the browser (CanvasKit/WASM). Strokes are structured objects with stable ids in a Zustand store (`features/whiteboard`).
- **Layout:** collapsible left AI sidebar on wide screens; drawer (closed by default) on narrow screens.
- **Mock tutor end to end:** sidebar button → `POST /api/tutor` → Zod-validated request → provider → re-validated response → UI card clearly labelled "MOCK RESPONSE".
- **Provider system:** `AIProvider` interface, `MockProvider` (one canned response per mode, including a highlight box for the distribution mistake), `selectProvider` (ollama/meta fall back to mock with a warning; meta additionally needs `ENABLE_PAID_AI=true`).
- Shared typed contract: `TutorRequest`, `TutorResponse`, `TutorResult`; highlight is 0–1000 normalized with tested conversion to canvas coordinates (`shared/src/geometry.ts`).

### Verified
| Check | Result |
|---|---|
| `npm run typecheck` (shared, server, client) | pass |
| `npm test`: shared 5, server 19, client 5 | 29 pass |
| Dev: mouse stroke draws in the browser pane (Skia/CanvasKit) | observed working |
| Dev: "Check my work" and "Give me a hint" return the mock card | observed working |
| Dev: server stopped → friendly error message | observed working |
| Dev: narrow (375px) layout → drawer closed by default, opens on tap | observed working |
| `expo export -p web` | builds; `canvaskit.wasm` included |

### Not verified / known gaps
- Only mouse drawing was exercised, with synthetic straight-line drags. Real touch/stylus input and curve smoothness are untested.
- Not tested on iOS/Android (the code uses no web-only APIs outside `*.web.tsx`, but this is unproven).
- No deployment yet.
- The mock never reads the canvas. Mock success says nothing about real AI accuracy.
- The `highlight` from the mock response is returned but **not rendered** on the canvas yet (Phase 3).
- `react-native` was aligned to 0.88.0 via `expo install --fix`.
- `npm audit` reports vulnerabilities in transitive dev dependencies; not investigated.
- No git repository yet (run `git init` when ready; `.gitignore` already excludes `.env`).

## Phase 2 — Functional whiteboard (done 2026-10-28, except save/restore which is Phase 5)

### Built
- **Tools:** pen (6 colours, 3 sizes), eraser (removes whole strokes; never images), select, hand. Floating toolbar wraps onto extra rows on narrow screens.
- **Undo/redo:** snapshot history (`logic/history.ts`, 100 steps). A whole drag, resize or erase sweep is one undo step (store transactions). Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y on web.
- **Pan/zoom:** hand tool, wheel pan, Ctrl/Cmd+wheel zoom about the cursor, +/−/reset control, two-finger pan and pinch wired for touch.
- **Images:** picker → decode (EXIF-oriented) → downscale to ≤2048px → data URI (web). Place, drag to move, corner handles to resize with fixed aspect. Images always render under strokes, so you can draw over them.
- **Select:** click to select a stroke or image, Delete removes it (undoable).
- **Clear:** in-app confirm dialog; clearing is undoable.
- **Export:** "Export PNG" renders all content with padding via an offscreen Skia surface, independent of pan/zoom, excluding selection UI. `renderRegion(objects, region, opts)` is the same function Phase 3 will use to snapshot the AI region.

### Verified
| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test`: shared 5, server 19, client 40 (logic + store) | 64 pass |
| Browser: pen colours, eraser sweep, keyboard undo/redo | observed working |
| Browser: image move and corner resize (aspect kept, SE corner fixed, one undo step each) | observed working |
| Browser: wheel pan, Ctrl+wheel zoom (point under cursor stays fixed), hand-tool pan | observed working |
| Browser: Clear → Cancel keeps work; Clear → confirm empties board; undo restores | observed working |
| Browser: select stroke, Delete, undo | observed working |
| Browser: exported PNG decoded: 1346×846, white padding, image colour exact, red stroke over image present | observed working |
| Browser: `prepareImage` shrank a 3000×2000 PNG to 2048×1365 | observed working |
| Mobile (375px) layout: toolbar wraps, drawing area stays free | observed working |
| `expo export -p web` | builds; export renderer is a separate lazy chunk |

### Not verified / known gaps
- **Not tested with a real file chooser:** I could not drive the OS file dialog. The picker code (`expo-image-picker`) was only exercised through its downstream `prepareImage` step with a generated image.
- **Touch/stylus not tested:** two-finger pan and pinch are wired (`useSimultaneousGestures`) but untested on a real touch device. Stylus pressure is ignored.
- **Not tested on iOS/Android.** On native, images are not downscaled and export shows "web only" (needs a file-system/sharing dependency).
- Eraser removes whole strokes, not pixels. Select moves strokes but can't resize them. No marquee or multi-select.
- Startup race: the canvas loads CanvasKit lazily, so adding an image in the first moment before the canvas mounts uses a default 1000×1000 size for placement.
- Image export in an automated test is not covered; only the pure sizing/bounds logic is (`logic/exportPlan.ts`). Skia rendering was checked by hand.
- Dev-only `window.__whiteboard` / `__prepareImage` handles exist for console debugging (guarded by `__DEV__`).
- A stray UTF-16 line (`# ThinkBoard-AI`) was appended to `README.md` outside this work; worth cleaning.

## Phase 3 — AI integration, mock first (done 2026-10-28)

### Built
- **Mock scenarios** for "Check my work" on 2(x + 3) = 14: distribution error, arithmetic error, missing steps, correct, unclear handwriting. A `mockScenario` request field selects one (only the mock provider reads it); the sidebar shows a "testing only" picker when `/api/health` says the server is mock. `hint`, `start` etc. keep one canned reply per mode.
- **Region capture:** each AI action exports the board with `renderRegion` (PNG, longest edge ≤ 1568px) and sends it with the exact canvas `region`. `chooseAIRegion` picks the selection if there is one, else the content on screen cropped to what is drawn there (40 units padding, min 200). Nothing on screen → the request is not sent and the student is told why. A plain question with no board content is sent without an image. The sidebar always says what the tutor will look at, and the card says what was sent.
- **Annotation layer:** the highlight lives in its own store (`features/annotations`) and is drawn by `AnnotationOverlay` inside the viewport transform. It is not in `objects`, undo history, or exports (`renderRegion` only draws student objects). A chip on the board has "Hide", and the mock chip says its position is canned.
- **Honesty rules:** `resolveAnnotation` draws a box only if the response has a location, confidence ≥ 0.6 (missing counts as low), and status is not `correct`/`uncertain`; otherwise text only, with a note in the card when a returned location was withheld. The box is mapped with the region captured at request time, so later pan/zoom does not misplace it.

### Verified
| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test`: shared 5, server 32, client 59 | 96 pass |
| Server: scenario schema validity, distinct statuses and lines, low-confidence pairing; image requires mime type; unknown scenario → 400 | automated |
| Client: normalized → canvas mapping in a cropped region, round-trip, confidence/status gating, region choice (selection, view, off-screen, clipped, minimum size) | automated |
| Browser: strokes → Check my work → orange box drawn over the board at the mapped position | observed working |
| Browser: request captured at 150% zoom + pan: region 322×307 (clipped to visible area), PNG 644×614, ≈9 KB base64, `mockScenario` sent | observed working |
| Browser: Unclear handwriting → no box, no chip, "not confident enough" note shown | observed working |
| Browser: Hide removes the box; `objects` count unchanged by highlights | observed working |
| Browser: selected stroke → sidebar says "your selection", region = that stroke + padding | observed working |
| Browser: panned away from all content → no request sent, friendly message | observed working |

### Not verified / known gaps
- **The mock cannot read the image.** Its highlight positions are fixed fractions of the exported region, so a box shows the pipeline works, not that a mistake was found. Real accuracy is untested until Phase 4.
- Highlight does not follow edits: it marks the board as it was when asked (chip text says so) until hidden or the next request.
- Exported PNG was not re-decoded this phase to prove the box is absent; that follows from `renderRegion` drawing only student objects.
- Selection persists after switching tools, so "selection" can be a leftover choice; the sidebar line shows it.
- Native (iOS/Android) not tested; the region image path uses the same Skia code.
- Image size/cost for real providers (Ollama/Meta token use) not measured; Phase 4.

## Whiteboard upgrade — boards, backgrounds, text, colours, sizes (done 2026-10-29)

### Built
- **Dashboard (`/`) and boards (`/board/[id]`):** cards with a preview thumbnail, last-edited time and item count; New, Open, Rename, Duplicate, Delete (with confirmation). Boards open from a link, so a reload returns to the same board.
- **Saving:** each board is stored in the browser (IndexedDB: a small "meta" store for the dashboard and a separate "content" store for objects). Autosaves 0.6s after an edit, flushes when you leave the board or hide the page, and shows Saving… / Saved / Could not save. Stored data is validated on load, so a damaged object is dropped instead of breaking the board.
- **Backgrounds:** Blank, Dots, Lines, Grid, per board. The pattern is infinite, pans and zooms with the board, thins out when zoomed out, and is capped at 5,000 elements per frame.
- **Text tool:** click to type (Esc cancels, click elsewhere commits), click existing text to edit it, move it with Select, erase it with the eraser. Text is drawn by Skia in a bundled font (Inter, SIL OFL, `client/assets/fonts`), so what you type is what is saved, exported and sent to the AI.
- **Colours:** 12 presets, the browser colour picker, a hex field, and recent colours. Applies to text being typed, else the selected stroke or text, else the active tool.
- **Sizes:** line width 1–64, text size 8–160, eraser size 4–60, each with −/+, a number field, a slider (web) and presets. Resizing a selected item is one undo step.
- **AI isolation kept:** the board background is never part of what the AI sees or of exports.

### Verified
| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test`: shared 5, server 32, client 130 | 167 pass |
| `expo export -p web` | builds |
| Browser: new board, draw, text (real typing), custom hex, size panel, selected-text resize (36→56, one undo step), background Grid | observed working |
| Browser: reload keeps objects, text sizes and background (IndexedDB) | observed working |
| Browser: dashboard card with thumbnail; rename from the board header; duplicate; delete with confirmation; deleted board stays gone after reload | observed working |
| Browser: AI request image at 1280px width contains the blue text and black stroke, zero grid-coloured pixels | observed working |
| Browser: 375px layout (actions on a second top-bar row, wrapped toolbar, panels above it) | observed working |

### Not verified / known gaps
- **Native (iOS/Android):** boards are kept in memory only there (the dashboard says so), image downscale and export are still web-only, and the colour picker/slider are web-only (hex field and −/+ work everywhere). Not run on a device.
- **Hosting:** the app is a single-page build; a host must serve `index.html` for `/board/<id>` URLs (rewrite all paths), or reloading a board will 404.
- **Boards live in one browser:** no accounts or sync, and clearing site data deletes them. Large imported images make big boards; there is no storage-quota warning yet.
- **Text:** no wrap or resize handles, one font and no bold/italic; double-click to edit is not implemented (use the Text tool). The editor caret may sit a pixel or two off the drawn glyphs because the visible text is Skia, not the input.
- **Exports:** Export PNG and the AI image are on white and do not include the background pattern.
- Real touch/stylus and the colour picker dialog itself (an OS widget) were not driven.
- Dev-only `window.__whiteboard` is still exposed in dev builds (used for the checks above).

## Whiteboard specification — gap analysis and checklist (started 2026-10-29)

Source: the 35-section "Complete Whiteboard Implementation Specification". Deadline: 2026-11-04 21:00 ET. Work is split into the spec's five milestones. A box is ticked only when the feature is implemented **and** checked; "partial" says what is missing.

### Gap analysis (what existed before Milestone 1)
| Area | Already there | Missing for the spec |
|---|---|---|
| Coordinate system | `screenToWorld`/`worldToScreen`/`zoomAt`/`visibleWorldRect` (tested) | zoom stops, fit-to-content |
| Pen / eraser | pen, whole-object eraser, one undo step per gesture | spec widths/colours, saved prefs, segment eraser, eraser cursor + sizes |
| Select | single select, move, image resize | multi-select, shift-toggle, marquee, group move, select all, duplicate, multi-delete |
| Pan / zoom | hand tool, wheel pan, ctrl+wheel zoom, ± buttons | Space and middle-mouse pan, zoom shortcuts, fit, bottom-right controls, stops |
| Undo / redo | snapshot history with transactions | top-bar buttons |
| Shell | top bar, docked/drawer AI panel, bottom toolbar | vertical floating tool rail, Lucide icons, tooltips, resizable panel, Ctrl+J, one popover at a time |
| Shortcuts | undo/redo/delete only, scattered | one central manager, platform-aware, typing-safe |
| Save status | Saving…/Saved/error | "Unsaved changes", retry |
| Not started | highlighter, shapes, lasso, context menu, z-order, rotate, copy/paste, drag-drop/paste images, export options, settings modal, dark mode, shortcut reference, region-select UI, Playwright | Milestones 2–5 |

### Expo / Skia / web compatibility notes
- Skia on web needs CanvasKit WASM (`setup-skia-web`), loaded lazily; Skia modules are only imported from the lazy canvas chunk.
- `lucide-react-native` needs `react-native-svg`; installed via `expo install` (15.16.0). Icons are deep-imported (`lucide-react-native/icons/<name>`) so the bundle does not carry the whole icon set.
- Gesture Handler 3 hooks give no modifier keys, coalesced pointer events or stylus pressure on web; Shift state is read from DOM pointer events, and pressure is not available through this path.

### Milestone 1 — Canvas and tools (done 2026-10-29; gaps listed)
Status key: ✅ implemented and checked · ◐ partly · ✗ not done.

| Item | Status | What was checked / what is missing |
|---|---|---|
| App shell: top bar (logo, editable title, save status, undo/redo, AI toggle, background, export, clear) | ✅ | Title: click to edit, Enter/blur save, Escape cancels, empty → "Untitled board". Missing from the spec's bar: Share, Settings, More (Milestone 3), tool indicator (optional) |
| AI panel collapsible + resizable (280–480 px), Ctrl+J | ✅ | Real drag 340 → 447 → clamped at 480; width and open state remembered; objects untouched. Content of the panel is still the Phase 3 mock UI (Milestone 4) |
| Vertical floating tool rail, Lucide icons, tooltips with shortcut, active state, labels | ✅ | Select, Hand, Pen, Eraser, Text, Image. Highlighter, Shapes, Lasso are **omitted** (not built yet). Bottom dock on narrow screens |
| One popover at a time; Escape order; outside-click closes | ✅ | Pen/eraser settings open next to the button on second click; choosing another tool, pressing on the canvas, or Escape closes them |
| Select: multi-select, Shift+click toggle, marquee, group move, Select all, Duplicate, multi-delete, Escape | ✅ | Marquee rule documented in `logic/selection.ts` (any part of the object touches the rectangle; strokes use their real path). Group move/duplicate/delete are one undo step. Locked objects, resize of non-image objects, Shift-constrain: Milestone 2 |
| Pen: spec colours (7 + custom picker/hex), widths 1.5/2.5/4/6/10 (+ any 1–64), live preview, saved between sessions | ✅ | Settings affect new strokes only. Opacity, smoothing level, pressure sensitivity are **not** implemented |
| Eraser: object and segment modes, sizes S/M/L + custom, ring cursor, one undo step per drag | ✅ | Segment mode cuts strokes at the exact edge of the ring into independent strokes (text/images untouched). Real drag verified. Locked-object rule: Milestone 2 |
| Pan: Hand (G), hold Space, middle mouse, wheel | ◐ | Hand, Space, wheel verified. **Middle mouse was only verified with synthetic events** (a real middle-button drag was not possible in the test tool). Two-finger touch pan is wired but untested on a device |
| Zoom: 10%–800%, stops, wheel/pinch, Ctrl +/−/0, Shift+1 fit, bottom-right controls | ◐ | Stops, focal-point preservation, fit and reset verified. Ctrl+= / Ctrl+− were verified with synthetic key events only (the test tool cannot send browser-zoom keys). Touch pinch untested on a device |
| Undo/redo buttons (disabled when unavailable) + shortcuts | ✅ | Ctrl+Z / Ctrl+Shift+Z verified with real key presses |
| Central shortcut manager (one handler, platform-aware, typing- and modal-safe) | ✅ | V G P E T I, Ctrl+Z/Shift+Z/Y, Ctrl+D/A/J, zoom keys, Shift+1, Delete, Escape. Not yet: Ctrl+C/X/V, Ctrl+N, Ctrl+S, `?` reference modal (Milestones 2/3/5) |
| Save status: Saving… / Saved / Unsaved changes / Error saving + Retry | ✅ | A forced IndexedDB failure showed "Error saving" with Retry, and Retry → "Saved" |
| Persistence of board and tool preferences across reload | ✅ | Objects, pen colour/width, eraser mode, panel width restored |
| Responsive (375 px): two-row top bar, bottom dock, popover above dock, 40 px targets | ✅ | No horizontal scroll; popover fully inside the viewport |

**Tests:** shared 5, server 32, client 211 = 248 pass. **Typecheck** clean. **`expo export -p web`** builds.

**Performance (measured, dev build, Chromium in the preview pane, panning continuously):**

| Strokes (40 points each) | Avg frame | p95 | ≈ fps |
|---|---|---|---|
| 100 | 6.4 ms | 11 ms | 157 |
| 500 | 14.2 ms | 18 ms | 70 |
| 1000 | 22.8 ms | 24 ms | 44 |
| 1000 at 400 % | 18.3 ms | 24 ms | 55 |

So 500 strokes pans above 60 fps, but **1000 strokes does not reach 60 fps** in this environment. The objects layer is memoized so panning skips re-reconciling them; the remaining cost is repainting every path each frame. Caching committed strokes into a Skia picture/image is the next step (Milestone 5). Not measured: production build, real GPU, drawing latency, undo/redo at scale, multiple large images.

**Known gaps in Milestone 1:** dark mode/semantic theme tokens (colours are still static), pen pressure and coalesced pointer events (Gesture Handler does not expose them on web), highlighter/shapes/lasso, stroke width changes are not pressure-aware, Playwright end-to-end tests, keyboard navigation inside menus, focus trapping in dialogs.

### Milestones 2–5
Not started. See spec sections 11–32. Dark mode, Playwright end-to-end tests, pen pressure, rotation and the highlighter/shapes/lasso tools are explicitly **not** in Milestone 1.

## Next: Phase 4 — Real AI
1. Ollama provider (local vision model), selectable with `AI_PROVIDER=ollama`; contract tests against the same suite.
2. Meta provider behind `ENABLE_PAID_AI`, with a server-side budget gate (per-session and daily call caps, conservative estimates, clearly labelled as estimates) and a usage dashboard. No paid call without an explicit click.
3. math.js verification of algebra steps so the UI can distinguish "AI says" from "checked".

## Later
- Phase 5: session save/restore, polish, deployment, demo script.
