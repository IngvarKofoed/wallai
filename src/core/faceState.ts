// faceState.ts — the authoritative face vector (server-side, single source of truth).
//
// On each program, FaceState folds the timeline's `set`s in order (last write wins per
// param), clamps via PARAMS, and stores the resulting resting pose. Reads answer from
// here — no round-trip to the browser. See ARCHITECTURE §6 (state ownership).

import type { Timeline } from './timeline'
import type { FaceVector } from './params'
import { NEUTRAL, clampVector } from './params'

/** Shallow copy of a full vector; every read/write crosses this boundary so callers
 *  never hold a live reference to the internal state. */
function copyVector(v: FaceVector): FaceVector {
  return { ...v }
}

export class FaceState {
  private vector: FaceVector

  constructor(initial: FaceVector = NEUTRAL) {
    this.vector = copyVector(initial)
  }

  /**
   * Fold the timeline into the current vector: apply each step's `set` in order,
   * last write wins per parameter, then clamp the result. Stores the settled pose
   * and returns a copy of it.
   */
  apply(t: Timeline): FaceVector {
    let next = copyVector(this.vector)
    for (const step of t) {
      for (const name of Object.keys(step.set) as (keyof FaceVector)[]) {
        const value = step.set[name]
        if (value !== undefined) next[name] = value
      }
    }
    this.vector = clampVector(next)
    return copyVector(this.vector)
  }

  /** The current settled pose, as a copy (never a live reference). */
  current(): FaceVector {
    return copyVector(this.vector)
  }

  /** Snap back to the neutral resting pose. */
  reset(): void {
    this.vector = copyVector(NEUTRAL)
  }
}
