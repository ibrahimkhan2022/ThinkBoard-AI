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

## Next: Phase 4 — Real AI
1. Ollama provider (local vision model), selectable with `AI_PROVIDER=ollama`; contract tests against the same suite.
2. Meta provider behind `ENABLE_PAID_AI`, with a server-side budget gate (per-session and daily call caps, conservative estimates, clearly labelled as estimates) and a usage dashboard. No paid call without an explicit click.
3. math.js verification of algebra steps so the UI can distinguish "AI says" from "checked".

## Later
- Phase 5: session save/restore, polish, deployment, demo script.
