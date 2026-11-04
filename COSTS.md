# ThinkBoard AI — Costs

## Current spend: $0.00

**No paid AI API has been called.** `AI_PROVIDER` defaults to `mock`. Meta is implemented but locked behind `AI_PROVIDER=meta`, `ENABLE_PAID_AI=true` and a server-side `MODEL_API_KEY` (none exists in this repo or on this machine). Every automated test runs with the network blocked, so no test can reach a paid API.

| Service | Purpose | Cost | Status |
|---|---|---|---|
| Mock provider | Canned tutor responses for development/tests | Free | Default |
| Ollama (local) | Real model on your own computer | No API charges; needs a download and local hardware | Implemented; smoke-tested with a text-only model. **A vision model is not installed yet** (`ollama pull gemma3:4b`, ~3 GB) |
| Meta Model API (Muse Spark) | Real multimodal tutoring | Pay per token from the ~$150 credits | Implemented and tested against a fake network only; **no real call made** |
| Expo / React Native / Skia / Fastify / Zustand / Zod / Lucide | Libraries | Free, open source | In use |
| Hosting for the web demo | Static client + small Node server | Not chosen yet; target a free tier | Pending (Phase 5) |

## Meta pricing used by the gate (read 2026-10-29 from https://dev.meta.ai/docs/pricing-rate-limits)
| Model | Input / 1M tokens | Output / 1M tokens | Notes |
|---|---|---|---|
| `muse-spark-1.3` (default), `-1.2`, `-1.1` | $1.25 | $4.25 | Content not used for training |
| `muse-wonder-1.0` | $4.00 | $20.00 | Larger, preview |
| `muse-spark-1.3-contributor`, `-1.2-contributor` | $0.10 | $0.20 | **Meta may train on prompts, files and replies** (student work). Refused unless `META_ALLOW_TRAINING_USE=true` |

Reasoning tokens are billed as output. Image input is billed as input tokens (about 1,300–1,500 for a ~1280 px image per Meta's docs; we assume more). Unknown model ids are priced like the most expensive known model.

## What one AI check should cost (estimate, not measured)
| Part | Tokens (assumed) | Cost at muse-spark-1.3 |
|---|---|---|
| System prompt + instruction | ~500 | $0.0006 |
| Board image (≤1280 px) | ~1,400–2,100 | $0.0018–0.0026 |
| Output (answer + hidden reasoning), **hard-capped at 1,200** | ~300–1,200 | $0.0013–0.0051 |
| **Typical total** | | **≈ $0.004–0.008** |
| **Worst case (every cap hit)** | | **≈ $0.0085–0.010** |

Chat history (the last 6 turns, each cut to 600 characters, answers reduced to their message) adds at most about 900 input tokens (≈ $0.001) to a follow-up, and the budget gate's worst-case reservation includes it. Off-topic questions are refused by the server before any model call, so they cost nothing.

So the ~$150 credit covers on the order of **15,000–35,000 checks**; the gate below limits that far more tightly. These figures are estimates from published prices and token rules. The first real call should be compared against Meta's dashboard (see "Verify after the first real call").

## Budget controls (implemented, server-side)
- **Paid calls need three switches:** `AI_PROVIDER=meta`, `ENABLE_PAID_AI=true`, and `MODEL_API_KEY`. Otherwise the server starts on the free mock and logs why.
- **Only on an explicit click:** the client calls the AI only from the tutor buttons; nothing runs on page load, canvas change or render. The student must also press "I understand, enable the tutor" once per session before the paid buttons unlock.
- **Gate before every call** (`server/src/budget.ts`): per-session call cap (`MAX_META_CALLS_PER_SESSION`, default 10), per-day cap across everyone (`MAX_META_REQUESTS_PER_DAY`, default 50), and a dollar budget (`META_BUDGET_USD`). It reserves the *worst-case* cost first, so parallel requests cannot overshoot, then records the cost estimated from the tokens Meta reports.
- **Counters survive restarts** (`server/data/usage.json`, git-ignored) so restarting the server does not reset the daily or dollar limits. The session cap is easy to dodge (the browser picks the session id); the daily and dollar caps are the real guard.
- **Hard output cap** (`META_MAX_OUTPUT_TOKENS`, default 1200) and **low reasoning effort** (`META_REASONING_EFFORT=low`) bound the cost of each call.
- **No automatic retries.** A failed paid call is shown to the student, who can press the button again. Calls that Meta rejected (401/402/429/5xx) are not charged; network failures and timeouts keep the worst-case charge because they may have been billed.
- **Usage is shown as an estimate** in the tutor panel ("our estimates from reported token counts, not a bill") and via `GET /api/usage`.
- **Privacy:** the board image goes to Meta only on a paid action, and the panel says so. The cheaper training-data model tier is blocked by default.

## What the gate is *not*
It is our own application guard using conservative estimates. It does not know about spend outside this process, other keys, or Meta-side charges, and is not provider-enforced. Meta's own limits and dashboard are authoritative.

## Verify after the first real call (needs your explicit go-ahead)
1. Add `MODEL_API_KEY` to the server `.env`, set `AI_PROVIDER=meta`, `ENABLE_PAID_AI=true`.
2. Make **one** check, then compare `GET /api/usage` with Meta's usage dashboard: input/output tokens and dollars should be close. Reasoning tokens are added on top of completion tokens here, which may over-count slightly.
3. Confirm the model id works and that `reasoning_effort: "low"` is accepted. If Meta rejects it, set `META_REASONING_EFFORT=off`.
4. Check the highlight lands on the right place on a few real boards before trusting it.

## Diagrams: Muse Image (added 2026-11-03)
`muse-image-1.0` draws one study diagram per press of the **Diagram** button for **$0.01** (a flat price per returned image; filtered or failed images are not charged; no separate charge for its built-in search, which we also switch off). Rate limit: 150 requests a minute. Diagrams go through the same gate as tutor checks: they count toward the session cap, the daily cap and the dollar budget, with a $0.01 reservation, so they cannot be used to get around the limits. The description is checked by the same study-only rule as chat questions before anything is sent (off-topic requests cost nothing). Never retried automatically. A diagram takes about 30 seconds. When the student refers to the board ("what this situation looks like"), Muse Spark first reads the board image and writes the brief (a normal Spark call, about half a cent, counted as a second request), so that diagram costs **about 1.5 cents**; a diagram of a named topic is one call, 1 cent.

## Speech to text: Muse Voice Transcribe (added 2026-11-04)

- `muse-voice-transcribe-1.0`, **$0.18 per hour of audio** (read 2026-11-04 from https://dev.meta.ai/docs/pricing-rate-limits), billed for the audio actually processed, rounded down to whole seconds. Requests that fail before a transcript, and 429s, are not billed. No contributor discount for voice.
- A 10-second question is about 0.05 cent; the longest recording the app takes (120 s) is 0.6 cent. The gate reserves the worst case (whole seconds, rounded up) first and refuses if the money budget would be passed.
- Dictation counts against the **money budget only**, not the per-session or per-day AI-check limits (so speaking does not use up tutor checks).
- Never retried automatically. A recording is only sent when the student presses the stop button, and only after the "I understand, enable the tutor" agreement. Listening itself costs nothing and sends nothing.
- **Live captions** use the same price ($0.18 per hour of audio, same rate for streaming and file). The gate holds back the worst case for the longest recording (0.6 cent), settles the whole seconds actually sent, and a Cancel pays only for what was sent. A live stream Meta never accepts is not charged.
- Not yet compared with Meta's dashboard (no real call made).

## Measured usage
First real calls, 2026-11-03 (key in the git-ignored `.env`, server-side only):
- **Muse Spark 1.3, one text-only question** (no image): 777 input tokens, reported output **1,944** tokens, estimated $0.0092. The output figure is above our own 1,200 cap, so the reported completion tokens probably already include the hidden reasoning and our code counts it twice (the over-count noted above); the real cost is likely lower. Compare with the Meta dashboard before relying on it. `reasoning_effort: "low"` was accepted. About 9 seconds.
- **Muse Image 1.0, one diagram** (the water cycle): about 29 seconds, a 1920×1280 PNG of 1.7 MB; recorded as $0.01.
- Our counters after these two calls: $0.0192 estimated, 2 requests (`server/data/usage.json`).
- **Diagram of a situation on the board** (Spark brief + image): about 28 seconds; estimated $0.0154 (brief: 771 input / 1,051 output tokens).
Not yet measured: a tutor check with a board image on the real model, and the dashboard comparison.
