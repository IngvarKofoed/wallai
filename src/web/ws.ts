// ws.ts — the browser WebSocket client.
//
// Connects to the server, parses ServerMessage, and dispatches to the face (the
// visual sink) and the panel (status + transcript). Reconnects with backoff.

import type { ServerMessage, ClientMessage } from '../core/protocol'
import { formatVector } from '../core/params'
import type { Face } from './face'
import type { Panel } from './panel'

// Defaults to the server's default WALLAI_PORT. If you run the server on a non-default
// port, set VITE_WS_PORT to the same value (see README) so the browser targets it.
const WS_PORT =
  Number(
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_WS_PORT,
  ) || 8787

export interface WsClient {
  /** Ask the server to run a feeling/situation prompt. `resetFirst` controls whether the
   *  face snaps to neutral before the run (false continues from the current pose). Returns
   *  false if the request could not be sent (socket not open), so the caller doesn't enter
   *  an in-flight state. */
  sendRun(prompt: string, resetFirst: boolean): boolean
}

export interface WsDeps {
  face: Face
  panel: Panel
}

function wsUrl(): string {
  const host = location.hostname || 'localhost'
  return `ws://${host}:${WS_PORT}`
}

export function createWs({ face, panel }: WsDeps): WsClient {
  let socket: WebSocket | null = null
  let backoff = 500 // ms, grows to a cap
  const BACKOFF_MAX = 5000

  function dispatch(msg: ServerMessage): void {
    switch (msg.type) {
      case 'hello':
        face.setVector(msg.vector)
        panel.log('info', `connected · ${formatVector(msg.vector)}`)
        break
      case 'runStarted':
        panel.runStarted(msg.prompt)
        break
      case 'transcript':
        panel.log(msg.kind, msg.text)
        break
      case 'play':
        void face.playTimeline(msg.timeline)
        break
      case 'state':
        // Informational only — the face is driven by 'play' / 'reset' / 'hello'. Snapping
        // here would cancel an in-flight tween mid-animation (a send-vs-receive pacing race,
        // worst on a backgrounded tab), truncating the very movement the run is showing.
        panel.log('state', formatVector(msg.vector))
        break
      case 'reset':
        void face.reset()
        panel.log('info', 'reset to neutral')
        break
      case 'runEnded':
        panel.runEnded(formatVector(msg.finalVector))
        break
    }
  }

  function connect(): void {
    panel.setStatus('connecting')
    const ws = new WebSocket(wsUrl())
    socket = ws

    ws.addEventListener('open', () => {
      backoff = 500
      panel.setStatus('connected')
    })

    ws.addEventListener('message', (ev) => {
      let parsed: ServerMessage
      try {
        parsed = JSON.parse(ev.data as string) as ServerMessage
      } catch {
        panel.log('error', 'received malformed message')
        return
      }
      dispatch(parsed)
    })

    ws.addEventListener('close', () => {
      if (socket === ws) socket = null
      panel.setStatus('disconnected')
      scheduleReconnect()
    })

    // On error the socket also closes; let the close handler do the reconnect.
    ws.addEventListener('error', () => ws.close())
  }

  function scheduleReconnect(): void {
    const wait = backoff
    backoff = Math.min(backoff * 2, BACKOFF_MAX)
    window.setTimeout(connect, wait)
  }

  function sendRun(prompt: string, resetFirst: boolean): boolean {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      panel.log('error', 'not connected — cannot start run')
      return false
    }
    const msg: ClientMessage = { type: 'run', prompt, resetFirst }
    socket.send(JSON.stringify(msg))
    return true
  }

  connect()
  return { sendRun }
}
