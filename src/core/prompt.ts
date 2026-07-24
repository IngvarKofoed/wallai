// prompt.ts — the BASE prompt: the task, the mechanical-not-emotional principle, and a
// parameter table auto-generated from PARAMS. The codec appends its own command syntax
// via `contribution.instructions`, so swapping the codec swaps "how to command the face"
// automatically (ARCHITECTURE §5.2). No DSL/JSON/MCP syntax is hard-coded here.

import type { PromptContribution } from './llm-types'
import { CONTROLS, CONTROL_NAMES } from './params'

/** Build the auto-generated control table by iterating CONTROLS — never hard-coded. */
function parameterTable(): string {
  const lines = CONTROL_NAMES.map((name) => {
    const { min, max, describe } = CONTROLS[name]
    return `- ${name} (range ${min} to ${max}): ${describe}`
  })
  return lines.join('\n')
}

/**
 * Compose the full system prompt from the BASE sections plus the codec's own
 * instructions (which teach the command syntax and the done signal).
 */
export function buildSystemPrompt(contribution: PromptContribution): string {
  const sections = [
    // (a) the role / task
    `You control a simple face — two eyes, two brows, and where the eyes look, over a
static neutral mouth. Your job is to physically express a given feeling or situation by
choosing values for the face's controls.`,

    // (b) the mechanical-not-emotional rule, stated plainly
    `The controls are MECHANICAL, never emotional. Each one describes geometry only — how
open, how dilated, how rotated, where pointed — and never a feeling. There is no "smile",
"angry", or "happy" knob. The feeling lives in the prompt you are given; your task is to
translate it into these physical settings yourself.`,

    // (c) the auto-generated control table, plus the per-side capability (stated as a
    // fact about the face, not DSL syntax — the codec teaches how to address each side).
    `The face has these controls, and each one exists independently for the LEFT and the
RIGHT side (viewer's perspective). So the face can be asymmetric — a wink, one brow cocked,
the eyes narrowed unevenly — not only mirror-symmetric:\n${parameterTable()}`,

    // (d) guidance: expression is movement
    `Expression is movement, not just a static pose. You may choreograph a sequence over
time — poses that animate and hold — so the face reads as a movement (a glance that darts
and settles, brows that shoot up). After each program you will be told the resulting face
state; refine it if it does not yet express the feeling, and emit the done signal once you
are satisfied.`,

    // the codec teaches its own syntax and done signal
    contribution.instructions,
  ]

  return sections.join('\n\n')
}
