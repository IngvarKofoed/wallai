# wallai — web (browser UI)

The browser app: the SVG face, the `requestAnimationFrame` tween engine, the control panel a human uses to trigger runs, and the WebSocket client that receives timelines from the server. See `docs/ARCHITECTURE.md` §5.3 (Renderer) and §2 (topology).

Contents: `index.html`, `face.ts` (SVG face + tween engine — animates eyes, brows, and gaze; draws a static neutral mouth), `panel.ts` (control UI + transcript), `ws.ts` (WebSocket client). Imports the shared contracts from `../core/`.

## Required tools

- **`LSP`** — TypeScript symbol navigation across the browser code and the shared `core/` types. Deferred tool: load with `ToolSearch` query `select:LSP`.
- **Playwright MCP (`mcp__playwright__*`)** — you MUST drive the running face in a real browser to verify any UI change; the test suite alone does not prove the face renders and animates. Deferred tools: load with `ToolSearch` query `select:browser_navigate,browser_snapshot,browser_console_messages` (and other `browser_*` tools as needed).

## Required skills

- **`frontend-design`** — invoke when building or reshaping the face view or control panel, so the UI reads as intentional and distinctive rather than templated.

## Testing

Component/DOM unit tests use **Vitest** (with a DOM environment such as happy-dom/jsdom), matching the backend framework. Keep tween math and vector→SVG mapping testable as pure functions. Do not introduce a different test framework without updating the architecture doc.

## Verification workflow

The obvious checks (`tsc --noEmit`, unit tests) don't prove the face actually renders and moves. For any UI change:

1. Start the dev server (Vite).
2. Drive the changed feature via Playwright MCP — headless by default, so rely on the page snapshot, not a visible window. Confirm the face responds to a timeline (eyes/brows/gaze animate) and the control panel works.
3. Check console messages and network requests (including the WebSocket) for errors.
4. Only then report the change as complete.
