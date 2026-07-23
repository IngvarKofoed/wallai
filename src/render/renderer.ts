// renderer.ts — the visual seam. A Renderer is a pure sink: it plays a Timeline and
// can reset to neutral. It does NOT own state (FaceState does).

import type { Timeline } from '../core/timeline'

export interface Renderer {
  readonly id: string
  /** Animate the timeline; resolves when it finishes. */
  play(timeline: Timeline): Promise<void>
  /** Snap back to the neutral vector. */
  reset(): Promise<void>
}
