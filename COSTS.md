# ThinkBoard AI — Costs

## Current spend: $0.00

No paid AI API has been called. `AI_PROVIDER` defaults to `mock`; `meta` is not implemented yet and would additionally require `ENABLE_PAID_AI=true`.

| Service | Purpose | Cost | Status |
|---|---|---|---|
| Mock provider | Canned tutor responses for development/tests | Free | In use |
| Ollama (local) | Optional local vision model | No API charges; needs suitable local hardware (RAM/GPU) and a model download | Not implemented (Phase 4) |
| Meta Model API (Muse Spark) | Real multimodal tutoring | Paid from the ~$150 free credits | Not implemented (Phase 4); **no calls made** |
| Expo / React Native / Skia / Fastify / Zustand / Zod | Libraries | Free, open source | In use |
| Hosting for web demo | Static client + small Node server | Not chosen yet; target a free tier | Pending (Phase 5) |

## Budget controls (planned, Phase 4)
- Server-side gate with conservative **estimated** pricing and limits from `MAX_META_CALLS_PER_SESSION`, `MAX_META_REQUESTS_PER_DAY`, `META_BUDGET_USD`. These are our own application limits, not provider-enforced limits, and the gate will not be presented as exact billing.
- Paid calls only on an explicit user click; never on canvas change, page load or render.
- Usage dashboard shows exact figures only if the provider reports them; otherwise labelled as estimates.
- Automated tests use the mock provider only.

## Measured / estimated usage
None yet.
