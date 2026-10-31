# ThinkBoard AI

An AI whiteboard tutor for students (hackathon project). Whiteboard (Skia, web first) plus a mock-first AI tutor that sends the board region and highlights its answer. See [PROGRESS.md](PROGRESS.md) and [COSTS.md](COSTS.md).

## Run locally

Requires Node 20+ (developed on Node 24).

```bash
npm install
cp .env.example .env     # optional; defaults already use the free mock provider
npm run dev:server       # API on http://localhost:8787
npm run dev:app          # web app on http://localhost:8081 (copies canvaskit.wasm first)
```

Checks:

```bash
npm run typecheck
npm test
```

## Use the AI tutor

The tutor reads the work around your most recent writing (or what you select, or the whole screen) and replies with what is wrong, a hint, where to start or the next step. Your lines of work are numbered on the board, and the conversation is saved with each board. It only answers study questions. The provider is chosen on the server in `.env`:

| Provider | Cost | Setup |
|---|---|---|
| `mock` (default) | Free | Nothing. Canned answers, clearly labelled |
| `ollama` | Free (your GPU) | Install [Ollama](https://ollama.com/download), then `ollama pull gemma3:4b` (or any vision model; `gemma4:12b` was tested) and set `AI_PROVIDER=ollama`, `OLLAMA_MODEL=<model>` |
| `meta` | Paid credits | `AI_PROVIDER=meta`, `ENABLE_PAID_AI=true`, `MODEL_API_KEY`; see [COSTS.md](COSTS.md) |

Restart `npm run dev:server` after editing `.env`. The panel's banner shows which one is active.

## Layout
- `client/` Expo + Expo Router + React Native Skia (web first)
- `server/` Fastify API with a provider-based AI layer (mock by default)
- `shared/` Zod schemas and coordinate math used by both

AI keys, if ever configured, live only in the server's `.env`; the client never sees them.
