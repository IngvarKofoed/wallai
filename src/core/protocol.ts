// protocol.ts — the WebSocket message contract between server and browser.
// Imported by both src/server/ and src/web/.

import type { FaceVector } from './params'
import type { Timeline } from './timeline'

export type ServerMessage =
  | { type: 'hello'; vector: FaceVector }
  | { type: 'runStarted'; prompt: string }
  | { type: 'transcript'; kind: 'reasoning' | 'program' | 'error' | 'info'; text: string }
  | { type: 'play'; timeline: Timeline }
  | { type: 'state'; vector: FaceVector }
  | { type: 'reset' }
  | { type: 'runEnded'; finalVector: FaceVector }

export type ClientMessage = {
  type: 'run'
  prompt: string
  /** Snap the face back to neutral before this run. Omitted/true → each run starts fresh
   *  (the historical behavior); false → continue the tween from the pose the last run
   *  settled into, so expressions can be chained (e.g. curious → suspicious). */
  resetFirst?: boolean
}
