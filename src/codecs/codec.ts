// codec.ts — the control-format seam. A Codec ENCODES its own format into the system
// prompt (describe) and DECODES model output into the shared Timeline IR (parse). It
// never executes; the Renderer plays the Timeline.

import type { Timeline } from '../core/timeline'
import type { ModelOutput, PromptContribution } from '../core/llm-types'

export type ParseResult =
  | { ok: true; timeline: Timeline; done: boolean }
  | { ok: false; errors: string[] }

export interface Codec {
  readonly id: string
  /** Encode this format into the system prompt (and contribute tool defs if tool-based). */
  describe(): PromptContribution
  /** Decode model output in this format into the shared Timeline IR. */
  parse(output: ModelOutput): ParseResult
}
