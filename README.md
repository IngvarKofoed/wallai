# wallai

A minimal face — two eyes, brows, and gaze — that an LLM drives with a tiny command language, to test whether a model can turn a feeling or situation into a believable facial expression.

## Run

```bash
npm run dev
```

Then open the URL Vite prints (http://localhost:8989 by default; it picks the next free port if that's taken).

`npm run dev` starts both the WebSocket server (the agentic loop) and the Vite dev server (the browser face) together.

## Configuration

The agentic loop calls the Anthropic API, so it needs a key. The easiest way is a `.env` file at the repo root (loaded automatically by the server and by Vite; `.env` is gitignored):

```bash
cp .env.example .env
# then edit .env and set ANTHROPIC_API_KEY
```

Or export it directly in your shell (a value set in the real environment wins over `.env`):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Optional: set `WALLAI_MODEL` to override the model (default `claude-sonnet-5`).

The server listens on `WALLAI_PORT` (default `8787`). If you change it, also set `VITE_WS_PORT` to the same value so the browser connects to the right port:

```bash
export WALLAI_PORT=9000
export VITE_WS_PORT=9000
```

Never commit a real key — `.env` is gitignored.
