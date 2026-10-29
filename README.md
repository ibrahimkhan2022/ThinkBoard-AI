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

## Layout
- `client/` Expo + Expo Router + React Native Skia (web first)
- `server/` Fastify API with a provider-based AI layer (mock by default)
- `shared/` Zod schemas and coordinate math used by both

AI keys, if ever configured, live only in the server's `.env`; the client never sees them.
