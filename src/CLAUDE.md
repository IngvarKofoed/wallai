# wallai — backend (Node/TS server-side)

Everything that runs on the server: the stable core contracts, the LLM provider, the codecs, the renderer sink, and the WebSocket server. See `docs/ARCHITECTURE.md` for how these fit together.

Contents: `core/` (params, timeline, faceState, prompt, orchestrator), `llm/` (provider + Anthropic default), `codecs/` (Codec interface + `dsl`), `render/` (Renderer interface + `remoteSvg` sink), `server/` (WebSocket server + wiring). Browser code under `src/web/` has its own `CLAUDE.md` with additional rules.

## Required tools

- **`LSP`** — use for TypeScript symbol navigation, references, and hover across the server-side code; don't grep for definitions when the language server can resolve them. Deferred tool: load with `ToolSearch` query `select:LSP` before first use.

## Required skills

- **`claude-api`** — invoke whenever you touch `llm/` or anything importing `@anthropic-ai/sdk`: model IDs, Messages API, tool-use loop, and prompt caching. Never answer LLM/model questions from memory here.

## Testing

Unit tests use **Vitest** (chosen to match the Vite toolchain in `docs/ARCHITECTURE.md`). Put tests next to the code they cover (`*.test.ts`). The core contracts (`params` clamping/validation, `faceState` fold logic, the `dsl` codec's `parse`) are the highest-value units to test. Do not introduce a different test framework without updating the architecture doc.

## Verification workflow

This is a headless subtree — the test suite is the verification. Before reporting a change complete:

1. Run the relevant Vitest suite.
2. Run `tsc --noEmit` to confirm the shared `core/` contracts still type-check (both `src/` and `src/web/` depend on them).
