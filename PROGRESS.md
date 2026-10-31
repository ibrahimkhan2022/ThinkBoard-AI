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

## Text box fixes (2026-10-30)

Reported: the text box felt buggy when typing and moving. Each problem was reproduced in the browser first.

| Problem found | Cause | Fix |
|---|---|---|
| Caret ended up inside the last word, drifting further from the text as the line got longer (36 px after one sentence) | The input used the system font while the board draws Inter | The same Inter file is registered as a browser font for the input; drift is now 1 px. No wrapping (`white-space: pre`) |
| Escape threw away everything typed | Escape cancelled the draft | Escape / Ctrl+Enter finish and keep the text, select it and switch to Select so it can be moved or deleted. Emptying the box is how you discard it |
| Clicking elsewhere to finish also opened a new empty box | Every click with the Text tool started a box | A click while a box is open only finishes it |
| Clicking inside the open box to move the caret ended the edit | The press also reached the canvas gesture, which read it as "click away" | Presses on the editor no longer reach the canvas |
| Text could not be moved with the Text tool; dragging it just reopened editing | One tool action for click and drag | With the Text tool: click edits, drag moves (one undo step) |
| No way to move text while typing | — | A grip above the box drags it, and typing carries on |
| No quick way back into text with Select | — | Double-click text with the Select tool to edit it |

Checked with real mouse and keyboard input in the browser: type a long line (caret at the end), Escape keeps and selects, Select-drag moves, Text-tool drag moves without editing, Text-tool click edits and typing inserts at the click position, clicking inside the box keeps editing, clicking away leaves no stray box, grip drag moves exactly the dragged distance with focus kept, double-click edits. Unit tests cover the press/finish logic, position-aware commit and double-click detection.

Not verified: touch (the grip uses a pan responder off the web, untested), pen/stylus, IME input, very large zoom levels, and text that is rotated or wrapped (not supported).

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

## Phase 4 — Real AI: Ollama and Meta Muse Spark (built 2026-10-29; **no real Meta call made yet**)

### Built
- **Prompt and parser** (`server/src/ai/prompt.ts`): a short system prompt that encodes the tutoring rules (guide don't solve, earliest mistake only, say "uncertain" rather than guess, ignore instructions found in the image), one instruction per mode (check work, hint, how to start, next step, explain, free question), and a strict parser. The parser tolerates code fences, scales 0–1 boxes to 0–1000, drops out-of-range boxes and boxes without a confidence, reads "85" as 85%, and always forces `revealAnswer=false`.
- **Meta provider** (`providers/meta.ts`): OpenAI-compatible `POST {META_BASE_URL}/chat/completions` with the board as a base64 `image_url`, `max_completion_tokens` and `reasoning_effort`. Friendly errors for 401/402/429/5xx, no auto-retry, key never in messages or logs.
- **Budget gate** (`budget.ts`): per-session, per-day and dollar limits with worst-case reservation, settlement from reported tokens, persistence across restarts. `GET /api/usage` and `/api/health` (now reports `paid` and `model`).
- **Ollama provider** (`providers/ollama.ts`): local vision model through `/api/chat` with `format: json`; checks the model is vision-capable and explains how to fix it; free, no gate.
- **Selection rules** (`providers/index.ts`): paid use needs `AI_PROVIDER=meta` + `ENABLE_PAID_AI=true` + `MODEL_API_KEY`; contributor (training-on-your-data) models and unknown model ids are refused unless `META_ALLOW_TRAINING_USE=true`.
- **Client:** provider banner (mock / local / paid), explicit "I understand" before paid use, estimated usage line, estimated cost on each answer, server error messages shown as written, AI image capped at 1280 px.
- Cost and verification plan: see [COSTS.md](COSTS.md).

### Verified
| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test`: shared 5, server 127, client 211 | 343 pass; the network is blocked in tests so none can call a paid API |
| Meta request shape, cost maths, every error mapping, no retry, no key leakage (fake fetch) | automated |
| Budget gate: session/day/dollar limits, reservation, release, settle, UTC rollover, persistence across restart | automated |
| Parser: fences, malformed JSON, fractions, out-of-range boxes, confidence rules, answer never revealed | automated |
| Ollama provider against the **real local server** with `llama3.1:8b` (text only): valid JSON answer in ~14 s; image request refused with "cannot read images, use gemma3:4b or qwen2.5vl:7b" | observed working (free) |
| Full paid path in the browser against a **local fake Meta server** (no real API): paid banner, buttons locked until "I understand" (a click on a locked button sent nothing), real HTTP request received with Bearer key, `muse-spark-1.3`, `max_completion_tokens: 1200`, `reasoning_effort: low`, system prompt and a PNG data URI; answer and highlight shown; "≈ $0.0033 (estimate)" on the card; usage line "1 of 3 checks"; counters written to `server/data/usage.json`; the 4th check refused by the gate with the session-limit message and never sent | observed working |

### Not verified / open
- **No real Meta call has been made**, so these are unconfirmed until you approve one: that `muse-spark-1.3` and `reasoning_effort: "low"` are accepted, the real token counts per image, whether `completion_tokens` already includes reasoning tokens, whether your account is in a supported region (Meta's launch notes mention the US), and how well the model reads handwriting and places the highlight box. Meta's docs pages for structured output and reasoning were not read; the prompt asks for JSON instead of relying on `response_format`.
- **No vision model is installed locally**, so reading a real board image with Ollama is untested. A small model is likely to misread handwriting and overstate confidence (the text-only test returned confidence 1.0).
- Accuracy of the math is the model's, not ours: nothing re-checks the algebra yet (a math.js verifier remains on the list), so the card says "not verified by a math checker".
- No "solve completely" mode (the spec's sixth quick action) and no SAM 3.1 / Muse Image / Muse Wonder use yet. SAM could later localise a highlighted step more accurately than asking the language model for a box.
- Session ids come from the browser, so only the daily and dollar caps stop a determined abuser of a public demo. No per-IP rate limit yet.
- The usage panel and spend are per server process/file: if the demo is hosted on a platform with an ephemeral disk, `usage.json` may reset on redeploy.

## Local AI test: Ollama with gemma4:12b (2026-10-30; free)

Ollama was updated to 0.40.13 (0.6.5 could not pull Gemma 3: HTTP 412). The model installed is `gemma4:12b` (11.9B, Q4, 8.0 GB; capabilities: vision, thinking, tools, audio) on an RTX 4060 Ti with 8 GB. No paid API was used.

### Results (typed worked example 2(x + 3) = 14, through the real app)
| Case | Result | Time |
|---|---|---|
| Mistake in step 2 (`2x + 3 = 14`), "Check my work" | Mistake found, guiding question "what happens to the 3?", orange box exactly on the wrong line, answer not given | 7 s |
| Hint / how to start / next step | Sensible, tutor-style, no final answer | 5–7 s each |
| Correct work | "Looks correct", no highlight | 4 s |
| Later arithmetic slip (`2x = 9`) | "What is 14 minus 6?", box on the wrong line | 7 s |

### The important finding: thinking mode
With the model's default "thinking" on, the first check took **~120 s** (near the client's 130 s timeout). With `think: false` the same check takes **~8 s** (1.3 s to read the image, 6.6 s to write ~100 tokens) with the same correct answer. `OLLAMA_THINK` is now a setting (`off` default, `on`, `auto`).

### Not verified
- **Real handwriting.** The test board used typed text (clean Inter). Messy handwriting, small writing and diagrams are untested and are where small local models fail most.
- Hard multi-step problems (thinking `off` may be worse there); nothing re-checks the maths.
- Confidence is not trustworthy: the model says 100% for everything.
- Only one problem type (linear equations); only one run per case, so no measure of consistency.

## Tutor chat redesign: handwriting, saved history, focus, study-only (built 2026-10-30; free; no paid call made)

### Built
- **Formatting.** The prompt bans LaTeX/`$`; the server and the client both convert any `$..$`, `\(..\)`, `\frac`, `^`, `_` to plain Unicode maths (`shared/src/mathText.ts`), and equations are shown as chips. Currency such as "$5" is left alone.
- **Handwriting.** The board work is grouped into numbered lines from the stroke geometry; blue numbered badges are drawn into the image the model sees, and the model answers with `errorStep` = line number. The highlight is drawn around the student's own line (the model's estimated box is only a fallback). Low confidence still means text only.
- **Where the student is.** By default the tutor sees only the cluster of work around the most recent mark that is on screen (a toggle switches to the whole screen; a selection always wins). A dashed outline with the same line numbers is drawn on the board while the panel is open (never saved or exported).
- **Asks back.** If it cannot tell which problem is meant, the model sets `needsInput` and the reply is a question.
- **Saved chat.** Messages are saved with each board (IndexedDB), restored on open, capped at 200, with "New conversation". The last 6 turns go to the model so follow-ups work.
- **Next step boxes.** "Next step" / "How to start" show the step as equation boxes (`5x − 10 + 10 = 0 + 10` → `5x = 10`).
- **Study only.** A server-side guard refuses off-topic or instruction-override questions before any model call (no cost). Check-my-work never returns the corrected line or a preview (enforced in `tutorService`, because the local model ignored the prompt once).
- New panel UI: header with provider pill, focus bar, welcome screen, message bubbles, answer cards with Retry/Show on board, composer with action chips.

### Verified
- `npm run typecheck` clean; tests: shared 17, server 172, client 270 (all passing, no network).
- In the browser against local `gemma4:12b` (free), on strokes drawn with a simple stroke font: the focus outline and numbered badges appear; a wrong third line (`5 − 1 = 2`) was reported as "Line 3" with a guiding hint and a highlight on that line; "write me a poem about cats" was refused without a model call; the whole conversation came back after a page reload; no horizontal overflow at 375 px width.

### Not verified / known gaps
- **Real handwriting is still untested**; my test strokes are clean polylines. On the same board the model wrongly called `5x − 10 = 0 → 5x = 0 + 10 → x = 4` "correct" (x should be 2), so a small local model still misses errors, and its confidence is always 100%.
- A stacked fraction may be split into two numbered lines.
- The screen-reader behaviour of the panel was not checked; the focus outline was only checked by DOM/screenshot at low resolution.
- Not run on a phone or in the Expo native apps; stale dev server on 8081 needs a restart to pick this up.

## Text and writing tools: editor rewrite, math keyboard, formatting, clipboard (built 2026-10-30; free; no paid call made)

### Root causes found (not event-handler patches)
1. **Typing a space or pressing Enter ended the edit.** `react-native-gesture-handler` listens for `Enter`/`Space` keydown on the canvas element (keyboard activation) and turns them into a press at the canvas centre; the text input sits inside that element, so the press "clicked away" and committed the box. React's `stopPropagation` is too late (the listener runs first). The editor now handles keys with native listeners on the input itself.
2. **Focus fought the browser.** `mousedown` moved focus away from the input that was opening, so the old code retried `focus()` at 0/60/150 ms and ignored blurs for 250 ms. The canvas now simply cancels that default `mousedown` while text is being created or edited (`useWebInput.web.ts`); no timers.
3. **A second click on a new or tiny box ended the edit** (the box was one character wide). The editing area now has a minimum width and the store decides whether a press is "inside" the open box (`draftBounds`), instead of relying on DOM event order.
4. **A click nudged the object** and added undo steps (no drag threshold on move). Moves now wait for 4 px of travel.
5. **Layout could not wrap or expand** (a single-line input with `white-space: pre` and a separate measuring effect). Text is now laid out by one pure engine (`logic/textFlow.ts`) used for drawing, caret, hit-testing and export, so they cannot disagree.
6. **`sanitizeObjects` rebuilt text objects field by field**, so any new formatting would have vanished on reload. It now keeps (and validates) `spans`, `align`, `fixedWidth`.
7. **The browser reports selection changes a moment after the key**, so a toolbar press right after Shift+Arrow acted on a stale selection. Toolbar actions now read the input's selection first.

### Built
- **Editor (web).** A hidden `<textarea>` supplies typing, IME and clipboard events; Skia draws the text, selection and caret from the shared layout, so the caret is exact at every zoom with superscripts, bold, wrapping. Multiline, word wrap, Enter, Backspace/Delete, arrows, Shift+arrows, Home/End (by visual line), Up/Down (by visual line, keeps column), Ctrl+arrows, Ctrl+A, mouse caret placement, drag selection, double-click = word, triple-click = paragraph, Tab = 4 spaces. Escape / Ctrl+Enter finish and select the box; clicking away saves; an empty box disappears. Ctrl+Z / Ctrl+Y inside the editor undo the text only; the whole edit is one board undo step. Ctrl/Cmd+B, I, U, `+` (superscript), `=` (subscript).
- **Rich text model.** `TextObject` keeps `text` as the source of truth plus `spans` (bold, italic, underline, superscript, subscript ranges), `align`, `fixedWidth`. Spans are edited per character (`logic/textRuns.ts`), so they cannot overlap or drift. Typing continues the formatting of the previous character; toggles at a bare caret apply to what is typed next. Superscript/subscript are drawn smaller and shifted by the layout, not by faking the font size, so cursor positions stay exact.
- **Resizing.** Two side grips on a selected text box set the width; the text wraps and the height follows (font size never changes). One undo step per drag.
- **Select / drag / edit are separate.** Select tool: click selects, double-click edits (caret where you clicked), drag moves (one undo step, exact at any zoom). Text tool: click on empty space creates and focuses; click on text edits it; a press inside the open box places the caret instead of moving it.
- **Math and symbols keyboard.** Categories (Common, Greek, Operators, Arrows, Sets & logic, Physics, Fractions), search box (by name or character), a `(a)/(b)` general-fraction button, one tap inserts at the caret without losing focus. Every symbol is checked by a test against the bundled fonts' glyph tables.
- **Font menu (added after the first pass).** Eight families in the toolbar: Inter, Atkinson Hyperlegible, Nunito (sans), Source Serif 4, Lora (serif), JetBrains Mono (mono), Caveat, Patrick Hand (handwriting). Per text box; applies to the edited box or the selected boxes (one undo step), saved with the board, kept by copy/duplicate, used by export, and new boxes start with the last font chosen (remembered between sessions). Files (SIL OFL, licences beside them, ~5.9 MB in total) load only when a box uses them. Inter, Atkinson Hyperlegible and JetBrains Mono have real bold/italic files; the others use Skia's synthetic bold/slant. Letters a font lacks (e.g. Greek in Caveat) fall back to Inter, then to the math font.
- **After a text box ends the tool returns to Select** (Escape, click away, or an emptied box); Escape also selects the box. Choosing another tool while editing keeps that tool.
- **Arrow keys leave super/subscript.** With the caret at the end of superscript or subscript text (or with the script switched on but nothing typed yet), Left or Right first leaves the script, without moving the caret, so the next character is plain; the next press moves normally. In the middle of a script the arrow just moves.
- **Symbol font.** Inter lacks ∈ ∉ ⊂ ∪ ∩ ∛ ∇ ℏ ℝ and more, which would draw as empty boxes on the board and in exports. With your permission **Noto Sans Math (SIL OFL, ~1 MB, `client/assets/fonts`, licence included)** was added as a per-character fallback, used by drawing, measuring and export alike.
- **Formatting toolbar** (above the box, flips below near the top, clamped to the canvas, never over the caret): size −/+, colour, B, I, U, superscript, subscript, alignment, symbols (editing only). It also formats whole selected text boxes (one undo step). Presses on it never take focus from the editor.
- **Clipboard.** Ctrl/Cmd+C, X, V use the browser's real clipboard events for whole objects (formatting preserved, new ids, each paste a step further along, one undo step), plus plain text from other applications becoming a new text box; Ctrl/Cmd+D duplicates. Inside the editor the browser handles copy/paste of characters (our handler adds the formatting). A key-press fallback covers browsers that send no event with nothing selected. Delete/Backspace and tool letters are ignored while a text box is open.
- Export and the AI image use the same layout (wrapping, scripts, underline, symbols).

### Verified
- `npm run typecheck` clean; tests: shared 17, server 172, client 337 (all passing, no network); the new client suites cover the layout engine (wrapping, caret, selection, hit-testing, scripts), span algebra, store editing (typing diffs, formatting, undo, commit, resize, duplicate/copy/cut/paste with fake clipboard data), board persistence of formatting, toolbar placement and the symbol set against the real font files.
- In the browser (Expo web, real mouse and key events through the browser pane): one click with the Text tool creates and focuses a box; spaces, Enter and the letter `p` type without ending the edit or switching tools; Home/Right/Shift+Right then the superscript/subscript buttons formatted the right characters even when pressed immediately; the symbol keyboard inserted π, θ, λ, ±, ∑, ∂ and (from search) ∪ at the caret and kept editing; Escape finished and selected the box; drag moved a box by exactly the pointer travel at 100% and 150% zoom, as one undo step; the side grip re-wrapped the text without changing the font; double-click on the Select tool edited with the caret where clicked and did not create a second box; double-click on empty space with the Text tool made one box; a click away from an empty box left nothing behind; Ctrl+D, Ctrl+C then Ctrl+V (twice) made copies with new ids at +24 and +48; Ctrl+Z / Ctrl+Y walked back and forward through move, edit and paste; reload restored text, formatting, fixed width and position; the image export matched what the board draws (bold, superscripts, subscript, underline, Greek, ∈ ℝ ∪ ∛); changing the colour from the toolbar worked.

### Not verified / known limits
- **Native (iOS/Android) editing** compiles and type-checks but was not run: it keeps a plain input (no custom caret, no formatting shortcuts), though existing formatting stays attached to characters. The toolbar and symbol keyboard are shared code but were only run on web.
- **Real OS copy/paste.** The browser pane's key events do not trigger the browser's native clipboard commands, so character copy/paste inside the editor and object copy/paste were exercised with synthetic `ClipboardEvent`s and the key-press fallback, not with a real system clipboard round trip. Pasting from another application is covered by unit tests only.
- **IME composition** and the on-screen keyboard on phones are untested.
- Font is per text box, not per character, and the menu lists names only (no preview in each font). Source Serif 4, Lora, Nunito and Caveat are variable fonts: the regular weight is used, so their bold is synthetic. Inter's bold/italic files are from release 3.19 while the bundled regular is a different build, so tiny metric differences are possible.
- Colour is per text box, not per character. No justify alignment, lists, links or arbitrary rich text; vector notation with an arrow above the letter is not supported (use bold, ∇, î, ĵ, ∥, ⊥ from the Physics tab).
- Kerning is not applied (each glyph uses its own advance), which is also how the board and export draw, so they agree.
- A text box is limited to 5000 characters.
- The symbol keyboard docks at the bottom of the canvas when there is no room beside the toolbar, which covers the bottom tool rail on small screens until it is closed.

## Chat maths, answers on request, script caret, scientific calculator (built 2026-10-31; free; no paid call made)

### Built
- **Chat shows maths as written.** `^`, `*`, `pi`, `<=`, `sqrt(`, `x_1` become real symbols (`a = 4 × π² × r × f²`) inside equations, in `shared/src/mathText.ts` (so server and client agree). A power or product the model forgot to put in backticks is tidied too. A power too long for a superscript (`^(a+b)`) is left as typed.
- **Answers when you ask for them.** Plain requests such as "what answer would I get", "just tell me", "give me the solution", "solve it for me" are detected on the server (`wantsAnswer`). Only then is the model told to state the result, `revealAnswer` can be true, and the card shows an **Answer** badge; guiding hint/next step are dropped from a revealed answer. Every other request is still guided with hints first, and Check my work still never gives the corrected line.
- **Caret size in super/subscript.** The text caret shrinks to the glyph size and moves up (superscript) or down (subscript) while that style is on, including when it is only switched on and nothing is typed yet.
- **Scientific calculator** (`client/src/features/calculator`): a floating panel (drag it by its title; a bottom sheet on small screens). Open it with the top-bar button or the **C** key.
  - Expression display with a caret you can move (◀ ▶ or tap a token), live answer while typing, history list (tap to reuse), Ans, memory (M+ M− MR MC) with an M indicator, DEG/RAD/GRAD, 2nd and hyp modes.
  - Functions: + − × ÷, brackets, xʸ, x² x³ x⁻¹, √ ∛ ˣ√, |x|, n!, nPr, nCr, %, EXP (×10ⁿ), π, e, Ran#, ln, log, eˣ, 10ˣ, sin cos tan, their inverses, and the hyperbolic ones (and inverses).
  - Parsed by our own expression parser (no `eval`): −2² = −4, 2^−3, right-associative powers, implied multiplication (2π, 3(4+1)) binding tighter than ÷, missing closing brackets closed for you, clean values at special angles (sin 30° = 0.5, tan 90° is an error), clear messages for division by zero, syntax and domain errors.
  - Answers show up to 10 digits, scientific notation when very large or small, optional fraction view (0.25 ⇄ 1/4). **Copy** and **To board** (adds "sin(30)² = 0.25" to the board as text).
  - Keyboard when the calculator has focus: digits, + - * / ^ ( ) % ! . Enter, Backspace, Delete (AC), arrows, Escape (close); the board's shortcuts never see these keys.

### Verified
- `npm run typecheck` clean; tests: shared 22, server 191, client 395, all passing with no network (new: ASCII-maths display, answer-request detection and gating, revealed answer standing alone, script caret geometry, 22 calculator-engine and 22 calculator-store tests).
- In the browser (real key presses and clicks): opening with C, typing 2+3*4 shows the live answer 14 and Enter commits it; sin(30)² = 0.25; Ans carries on; History fills; To board put "sin(30)² = 0.25" on the board; the caret was small and high with superscript on and small and low with subscript on; asking "just give me the answer" returned an **Answer** card written as `4 × π² × 6 × 3²` with no ^.

### Not verified / known limits
- **The local model's arithmetic is unreliable.** For r = 6, f = 3 it gave 678.58 where the correct value is 2131.83. Nothing re-checks a revealed answer, so the card still says "not checked by a maths solver"; use the calculator to confirm. Making the server recompute simple arithmetic claims is a possible follow-up.
- The calculator panel was exercised in the narrow (sheet) layout and measured in the wide layout; dragging it was not exercised. No graphing, equation solving, matrices or unit conversion, and history is not saved with the board.
- `^` typed into a text box on the board is not converted (only chat text is).

## Check my work: say what is wrong, check units, let a calculator judge the arithmetic (built 2026-10-31; free; no paid call made)

### The problem (found from a real card)
A student used r = 6 where the formula needed 0.06 m (r was in cm). Check my work answered "Mistake found, line 3 ... try calculating again": it missed the unit mistake, blamed a calculation that was right, and gave no reason. With correct work it sometimes still said "Mistake found". Causes: the prompt told the model to answer only with a guiding question (never to say what was wrong) and never mentioned units; and a small local model is unreliable at arithmetic, which it was asked to judge.

### Changes
- **Prompt (server/src/ai/prompt.ts).** Checking work now says exactly what is wrong, why and what it should be ("r = 6 cm must be 0.06 m because the formula uses metres"); never just "check again"; every value is compared with the unit the formula needs; never invent a mistake (recompute, and if it matches the student's line the line is correct). It does not give the final answer unless asked.
- **Line transcription.** The model also copies each numbered line as it reads it (`lines`). The server re-does the arithmetic of those lines with the calculator engine (now in `shared/src/calculator.ts`, shared with the client): an `=` chain inside a line, or a result on the line below its calculation about the same variable (`shared/src/mathLines.ts`). Only plain numbers and operators are judged; anything with a variable, a word or a unit it cannot be sure of (such as a bare `m`) is left alone. A result counts as right if it is the exact value rounded or cut off at the digits written.
- **The calculator overrules the model on arithmetic (server/src/ai/reconcile.ts).**
  - A wrong result is reported as the mistake, naming the line, the calculation and what it really works out to, unless the model already named an earlier line.
  - "Mistake found" about the calculation on a line that checks out is withdrawn: if the model took its own complaint back in the same message it becomes "correct"; otherwise "not sure" with a pointer to the numbers and units put in.
  - A complaint that names a different input (a unit to convert, "should be 0.06") is left as a mistake, since the calculator cannot judge that.
- The card says what the calculator re-checked ("arithmetic on line 3 re-checked with a calculator, the rest not checked by a maths solver").

### Verified
- `npm run typecheck` clean; tests: shared 36, server 206, client 395 (new: transcribed-line verification, the reconcile rules with messages taken from real model output, prompt content).
- Against the local `gemma4:12b` with the board text (not the image) for your example: wrong units, 3 of 3 runs name line 2 and the unit ("you must convert 6 cm to 0.06 m"); in the browser through the real app the card showed that too, with the calculator note. Correct work (r = 0.06, result 21.32), 6 runs: 4 no longer say "Mistake found" (the calculator's re-check turns them into "not sure"/"correct"), 2 still did.

### Not verified / known limits
- **Still not reliable on correct work.** In about a third of my small sample the model invented a non-arithmetic mistake (for example "you forgot to square the frequency" when 3² is written), which the calculator cannot disprove. Runs were text-only (the board contents given as text), not real handwriting images; reading handwriting is a separate source of error, and a misread number can make the calculator report a wrong result that is really a misreading (the message says "as I read line N").
- The calculator can only judge arithmetic. Whether the right numbers and units were used is still the model's judgement, and the card says so.
- Withdrawn arithmetic complaints show as "not sure" rather than "Looks correct", because the units were not verified.
- The answer-on-request path (`just tell me`) is not re-checked by the calculator.

## Subscripts in the tutor's explanations (2026-10-31)
`v_0`, `E_k`, `v_max`, `x_{n+1}` now show as v₀, Eₖ, vₘₐₓ, xₙ₊₁ in chat, inside equations and in plain sentences (a lone letter followed by a short subscript, so snake_case words are untouched). Subscript letters were extended to h k l m n p s t j r u v. A subscript with a letter that has no Unicode form (for example the "eq" in T_{eq}) is drawn as real smaller, lowered text instead of an underscore. Verified in the browser with the local model (v₀, Eₖ and a lowered "eq"); `shared` 40 tests, client 395, server 206 pass. Limits: the lowered text uses CSS `vertical-align`, so on the phone/tablet builds it is a smaller baseline-aligned subscript that was not run there.

## Later
- Phase 5: session save/restore, polish, deployment, demo script.
