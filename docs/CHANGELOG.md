# Changelog

Each entry is numbered with a monotonically increasing integer. Append new entries to the end. Never reuse or reorder numbers. Numbers are globally unique across this file and any future `CHANGELOG-archive.md` — never reused. Write each entry as durable project memory: what is now true that wasn't before, plus the why in a clause when not obvious — not a recap of the diff (filenames and mechanical edits live there). Keep it to 1–5 lines, ~20 words per line at most; never one packed run-on line.

1. Initialized the project (TypeScript + ESM, Vite, Vitest, `ws`, `@anthropic-ai/sdk`) and built the MVP end to end:
   an SVG face (eyes, brows, gaze; static neutral mouth), the `dsl` codec, the Anthropic provider, a WebSocket server,
   the browser control panel, and the multi-turn refine orchestrator. Typecheck, 42 tests, and `vite build` are green,
   and the assembled app was verified live in a browser (connect → run → graceful error → recover).

2. The control-format seam is the `Codec` (encode = `describe`, decode = `parse`), not an "interpreter" — it never executes.
   MVP builds only the `dsl` codec; `json`/`mcp` stay designed-for behind the interface but unimplemented.
   No global registries: `src/server/wiring.ts` picks each seam via explicit id→factory maps keyed by env
   (`CODEC`/`LLM`/`RENDERER`, defaulting dsl/anthropic/svg).

3. DSL out-of-range values are clamped to range (per CONCEPT §3), not rejected; only unknown parameter names and
   non-numeric values are errors, and an orphan `hold` (no preceding pose) is reported rather than silently dropped.
   `tween`/`hold` durations are capped at 10s each so a model cannot stall the server's duration-paced, single-flight play loop.

4. Each run resets both the browser and the server-authoritative `FaceState` to neutral, keeping them in sync.
   The server always emits `runEnded` (even when a run throws), so the UI leaves its in-flight state.
   With no `ANTHROPIC_API_KEY` set, a run surfaces a clean error transcript instead of crashing the server.

5. Hardened after a high-effort code review so run-state can't get stuck: the browser clears its
   in-flight flag on disconnect and only enters it when the send actually succeeds; the server
   always gives feedback (busy / empty-prompt / error) and always emits `runEnded`.
   Empty or whitespace-only prompts are now rejected server-side before reaching the model.

6. A DSL program is bounded as a whole (≤16 steps, ≤20s total), not just per step, so a many-step
   sequence can't stall the single-flight server; a 30s renderer-side cap backstops any codec.
   The browser no longer snaps the face on a `state` message, so an animation is never truncated
   mid-play by the send-vs-receive pacing race.

7. LLM hot path: the Anthropic client is built once and reused (keep-alive), and the byte-stable
   system prompt is sent with an ephemeral `cache_control` breakpoint (prompt caching), per the
   claude-api mandate. The browser WS port is configurable via `VITE_WS_PORT` to match a
   non-default `WALLAI_PORT`.

8. A `.env` at the repo root is now loaded automatically — the server via `dotenv`, the browser
   via Vite's `envDir` pointed at the root — so all vars (`ANTHROPIC_API_KEY`, `WALLAI_MODEL`,
   `WALLAI_PORT`, `VITE_WS_PORT`) live in one gitignored file. `.env.example` is the template;
   real-environment values still override `.env`.

9. The frontend (Vite) dev server now defaults to port 8989 instead of the crowded 5173.
   `npm run dev` still starts both it and the WebSocket server (8787) together.

