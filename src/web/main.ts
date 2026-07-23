// main.ts — browser entry point. Wires the face, the panel, and the WebSocket
// client together and mounts them into the page shell (index.html).

import { createFace } from './face'
import { createPanel } from './panel'
import { createWs, type WsClient } from './ws'

function mount(): void {
  const faceHost = document.getElementById('face')
  const panelHost = document.getElementById('panel')
  if (!faceHost || !panelHost) {
    throw new Error('main: missing #face or #panel mount point')
  }

  const face = createFace(faceHost)

  // The panel needs to send runs; the ws client is created just after, so the
  // onRun closure reads it lazily (it is only ever called after wiring).
  let ws: WsClient
  const panel = createPanel(panelHost, {
    onRun: (prompt, resetFirst) => ws.sendRun(prompt, resetFirst),
    // Drive the face's thinking chrome off the panel's in-flight flag: on from a
    // successful Run submit until the run ends (or a disconnect clears it).
    onRunningChange: (running) => face.setThinking(running),
  })

  ws = createWs({ face, panel })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount)
} else {
  mount()
}
