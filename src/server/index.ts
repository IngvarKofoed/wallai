// index.ts — the Node WebSocket server (ARCHITECTURE §2, §3, §8). It hosts one shared
// FaceState + Orchestrator, broadcasts every ServerMessage to all connected browsers, and
// turns an incoming { type: 'run', prompt } into a single orchestrator run. Concurrent
// runs are ignored while one is in flight. API keys live only here, never in the browser.

import { config as loadEnv } from 'dotenv'
import { WebSocketServer, WebSocket } from 'ws'

import { buildOrchestrator } from './wiring'
import type { ServerMessage, ClientMessage } from '../core/protocol'

// Load .env (ANTHROPIC_API_KEY, WALLAI_MODEL, WALLAI_PORT) into process.env before anything
// reads it. Values already set in the real environment win — dotenv does not override them.
loadEnv()

const PORT = Number(process.env.WALLAI_PORT ?? 8787)

/** Reject absurdly long run prompts before they reach the model. */
const MAX_PROMPT_LEN = 2000

const clients = new Set<WebSocket>()

/** Send a message as JSON to every open client. */
function broadcast(msg: ServerMessage): void {
  const data = JSON.stringify(msg)
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data)
    }
  }
}

const { orchestrator, faceState, renderer } = buildOrchestrator(broadcast)

let running = false

async function handleRun(prompt: string, requester?: WebSocket): Promise<void> {
  if (running) {
    // A run is already in flight (single-flight). Tell the requester so the click isn't
    // silently swallowed; its Run button re-enables when the in-flight run's runEnded
    // broadcast arrives. Without this, a client that connected mid-run sees Run do nothing.
    if (requester && requester.readyState === WebSocket.OPEN) {
      requester.send(
        JSON.stringify({
          type: 'transcript',
          kind: 'info',
          text: 'a run is already in progress — try again in a moment.',
        } satisfies ServerMessage),
      )
    }
    return
  }
  running = true
  try {
    // Reset BOTH the authoritative server state and the browser visual, so each run starts
    // from neutral and the two never diverge (ARCHITECTURE §6). Resetting only the renderer
    // would leave FaceState carrying the previous run's pose into this one.
    faceState.reset()
    await renderer.reset()
    await orchestrator.run(prompt, broadcast)
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err)
    broadcast({ type: 'transcript', kind: 'error', text: `run failed: ${text}` })
    // orchestrator.run threw before it could emit runEnded; emit it here so the browser
    // leaves its in-flight state (otherwise the Run control stays disabled until reconnect).
    // Success and error paths are mutually exclusive, so runEnded still fires exactly once.
    broadcast({ type: 'runEnded', finalVector: faceState.current() })
  } finally {
    running = false
  }
}

const wss = new WebSocketServer({
  port: PORT,
  // Only accept connections from the local dev origins (or non-browser clients, which send
  // no Origin). Stops an unrelated page open in the browser from triggering billable runs.
  verifyClient: (info: { origin: string }) => {
    const origin = info.origin
    if (!origin) return true
    try {
      const host = new URL(origin).hostname
      return host === 'localhost' || host === '127.0.0.1' || host === '::1'
    } catch {
      return false
    }
  },
})

// Without an 'error' listener, a bind failure (e.g. port in use) is thrown as an uncaught
// exception. Surface it clearly and exit instead of crashing with a raw stack.
wss.on('error', (err) => {
  const e = err as NodeJS.ErrnoException
  if (e.code === 'EADDRINUSE') {
    console.error(`wallai: port ${PORT} is already in use — set WALLAI_PORT to a free port.`)
  } else {
    console.error('wallai server error:', e.message)
  }
  process.exit(1)
})

wss.on('connection', (ws) => {
  clients.add(ws)
  // Greet the new client with the authoritative current pose.
  ws.send(JSON.stringify({ type: 'hello', vector: faceState.current() } satisfies ServerMessage))

  ws.on('message', (raw) => {
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage
    } catch {
      return // ignore malformed frames
    }
    if (msg && msg.type === 'run' && typeof msg.prompt === 'string') {
      if (msg.prompt.trim().length === 0) {
        ws.send(
          JSON.stringify({
            type: 'transcript',
            kind: 'error',
            text: 'prompt must not be empty.',
          } satisfies ServerMessage),
        )
        return
      }
      if (msg.prompt.length > MAX_PROMPT_LEN) {
        ws.send(
          JSON.stringify({
            type: 'transcript',
            kind: 'error',
            text: `prompt too long (max ${MAX_PROMPT_LEN} characters)`,
          } satisfies ServerMessage),
        )
        return
      }
      void handleRun(msg.prompt, ws)
    }
  })

  ws.on('close', () => {
    clients.delete(ws)
  })

  ws.on('error', () => {
    clients.delete(ws)
  })
})

wss.on('listening', () => {
  console.log(`wallai server listening on ws://localhost:${PORT}`)
})
