// timeline.ts — the format-agnostic animation IR every Codec produces and every
// Renderer plays. A single pose is a one-step Timeline; a choreographed sequence
// (via `hold`) is many steps.

import type { PartialVector } from './params'

/** Default tween duration (ms) applied when a step does not specify one. */
export const DEFAULT_TWEEN_MS = 250

export interface Step {
  /** Target values reached during this step (only the params this step touches). */
  set: PartialVector
  /** Time to animate into `set`. */
  tweenMs: number
  /** Pause after reaching `set` (0 = none). */
  holdMs: number
}

export type Timeline = Step[]

/** Total wall-clock duration of a timeline: the sum of every step's tween + hold. */
export function totalDurationMs(t: Timeline): number {
  return t.reduce((sum, step) => sum + step.tweenMs + step.holdMs, 0)
}
