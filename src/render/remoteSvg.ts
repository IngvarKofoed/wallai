// remoteSvg.ts — the default `svg` renderer, split across the wire. This server-side
// half is a pure sink: it serializes each Timeline over the WebSocket (via the injected
// broadcast function) and paces the orchestrator loop to the animation. The browser half
// holds the actual SVG + requestAnimationFrame tween engine. See ARCHITECTURE §5.3.

import type { Renderer } from './renderer'
import type { Timeline } from '../core/timeline'
import { totalDurationMs } from '../core/timeline'
import type { ServerMessage } from '../core/protocol'

/** Hard ceiling (ms) on how long a single play() will pace the loop, regardless of the
 *  timeline's summed duration. A backstop under the codec's own bounds so that whatever
 *  codec is wired in, one run can never hold the server's single-flight lock indefinitely. */
const MAX_PLAY_MS = 30_000

export class RemoteSvgRenderer implements Renderer {
  readonly id = 'svg'

  constructor(private readonly broadcast: (msg: ServerMessage) => void) {}

  /**
   * Push the timeline to every connected browser and resolve once the animation has had
   * time to finish, so the orchestrator's refine loop is paced to the visuals. An empty
   * timeline animates nothing and resolves immediately.
   */
  play(timeline: Timeline): Promise<void> {
    if (timeline.length === 0) return Promise.resolve()
    this.broadcast({ type: 'play', timeline })
    const durationMs = Math.min(totalDurationMs(timeline), MAX_PLAY_MS)
    return new Promise((resolve) => setTimeout(resolve, durationMs))
  }

  /** Tell every browser to snap back to the neutral vector. */
  reset(): Promise<void> {
    this.broadcast({ type: 'reset' })
    return Promise.resolve()
  }
}
