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

## Next: Phase 3 — AI integration (mock first)
1. Richer mock scenarios (correct, distribution error, arithmetic error, missing steps, hint, start) with highlight coordinates.
2. Send an exported region (`renderRegion`, ≤ ~1568px) with each AI action; honour selection/visible region.
3. Render highlight in a separate AI-annotation layer (normalized 0–1000 → canvas via `normalizedBoxToCanvasRect`), never in the student's objects or exports; fall back to text when confidence is low.
4. Tests for annotation conversion with pan/zoom and cropped regions.

## Later
- Phase 3: richer mock scenarios, send exported region, render highlight in a separate annotation layer.
- Phase 4: Ollama provider, Meta provider + server-side budget gate + usage dashboard (paid calls stay off by default).
- Phase 5: session save/restore, polish, deployment, demo script.
