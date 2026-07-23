// dsl.ts — the MVP control-format codec (id = "dsl").
//
// ENCODE: describe() teaches the tiny command language (set / tween / hold / state /
// done / #comment) in the system prompt and asks the model to emit its program inside a
// fenced code block tagged `face`.
// DECODE: parse() extracts that block from the model's text and folds it into the shared
// Timeline IR.
//
// This is a TEXT codec — it contributes no tools. It never executes; the renderer plays
// the Timeline it produces.
//
// Mechanical, not emotional: every parameter this codec speaks is pure geometry (how
// open, how dilated, how rotated, where pointed). There is deliberately no
// smile/angry/happy anywhere — emotional vocabulary lives only in the prompt's task text,
// never in the controls.

import type { Codec, ParseResult } from './codec'
import type { ModelOutput, PromptContribution } from '../core/llm-types'
import type { Step, Timeline } from '../core/timeline'
import { DEFAULT_TWEEN_MS } from '../core/timeline'
import { PARAMS, PARAM_NAMES, isParamName, clampValue } from '../core/params'

/** Matches every fenced block whose opening line is three backticks + `face`. */
const FACE_BLOCK = /```[ \t]*face[ \t]*\r?\n([\s\S]*?)```/gi

/** Upper bound (ms) on any single tween/hold. Guards the server's paced play loop — which
 *  awaits the timeline's real duration under a single-flight lock — against a model that
 *  emits an absurd duration (a DoS-shaped stall), and keeps totals well inside the range
 *  where setTimeout behaves. Durations are clamped, not rejected. */
const MAX_DURATION_MS = 10_000

/** Whole-program bounds. The per-step clamp above does not stop a model from emitting many
 *  steps whose durations SUM to a huge total that the server awaits under its single-flight
 *  lock, so cap the step count and the summed duration too. These are reported (the model
 *  can shorten and retry), not silently truncated. */
const MAX_STEPS = 16
const MAX_TOTAL_MS = 20_000

/** The last ```face block in the text, or the whole text if there is none. */
function extractProgram(text: string): string {
  let last: string | null = null
  let m: RegExpExecArray | null
  FACE_BLOCK.lastIndex = 0
  while ((m = FACE_BLOCK.exec(text)) !== null) {
    last = m[1]
  }
  return last !== null ? last : text
}

/** Split a program into trimmed statements: newlines and `;` separate; `#` comments and
 *  blank statements are dropped. Comments are stripped per line before splitting on `;`,
 *  so a `;` inside a comment never spawns a statement. */
function tokenizeStatements(program: string): string[] {
  const out: string[] = []
  for (const line of program.split(/\r?\n/)) {
    const noComment = line.split('#')[0]
    for (const part of noComment.split(';')) {
      const s = part.trim()
      if (s) out.push(s)
    }
  }
  return out
}

export class DslCodec implements Codec {
  readonly id = 'dsl'

  describe(): PromptContribution {
    const paramTable = PARAM_NAMES.map((name) => {
      const p = PARAMS[name]
      return `  ${name}   range ${p.min}..${p.max}   ${p.describe}`
    }).join('\n')

    const instructions = `## Driving the face — the "face" command language

You command the face by writing a short program in a tiny line-based language, then
placing it inside a fenced code block whose opening line is three backticks followed by
the word \`face\`:

\`\`\`face
...your program here...
\`\`\`

Only the LAST such \`face\` block in your reply is executed, so write one block.

### Statements (one per line, or separated by \`;\`)

  <param> <number>   set a target value for a parameter (see the table below)
  tween <ms>         animation duration (ms) for the SETS THAT FOLLOW; default ${DEFAULT_TWEEN_MS}
  hold <ms>          pause for <ms> after reaching the current pose (for timed sequences)
  state              ask the simulator to report the current parameter vector back to you
  done               you are satisfied with the expression; ends the refine loop
  # ...              a comment, to end of line

### Parameters (purely geometric — pick real numbers, e.g. 0.62, not just "open")

${paramTable}

### Semantics

- Each \`<param> <number>\` sets a target. Values are CLAMPED to the parameter's range
  above; you cannot exceed it.
- \`tween <ms>\` sets the animation time for every set that comes after it, until the next
  \`tween\`. With no \`tween\`, the default is ${DEFAULT_TWEEN_MS} ms.
- \`hold <ms>\` pauses after the current pose is reached. Use \`hold\` to choreograph a
  SEQUENCE of poses over time (a blink, a glance that darts away and settles), not just one
  static pose.
- Unknown parameter names and non-numeric values are reported back to you as errors so you
  can fix them. Out-of-range values are clamped (not rejected).
- Write \`done\` when the expression is finished.

### Example — a single pose (brows up, eyes wide, pupils a little dilated, glance slightly up)

\`\`\`face
tween 350
brow.angle 1.0
eye.open 1.0
eye.pupil 0.7
gaze.y 0.2
state
done
\`\`\`

### Example — a timed sequence (a wary glance to the left that then relaxes)

\`\`\`face
tween 120 ; gaze.x -0.8 ; eye.open 0.5 ; brow.angle -0.3
hold 500
tween 300 ; gaze.x 0 ; eye.open 0.8 ; brow.angle 0
done
\`\`\``

    return { instructions }
  }

  parse(output: ModelOutput): ParseResult {
    const program = extractProgram(output.text ?? '')
    const statements = tokenizeStatements(program)

    const errors: string[] = []
    const steps: Timeline = []
    let current: Step | null = null
    let currentTween = DEFAULT_TWEEN_MS
    let done = false

    const parseMs = (raw: string | undefined, keyword: string): number | null => {
      const n = Number(raw)
      if (raw === undefined || raw === '' || !Number.isFinite(n)) {
        errors.push(`${keyword} requires a numeric duration in ms (got "${raw ?? ''}")`)
        return null
      }
      if (n < 0) {
        errors.push(`${keyword} duration must not be negative (got ${n})`)
        return null
      }
      // Clamp (don't reject) an over-long duration — see MAX_DURATION_MS.
      return Math.min(Math.round(n), MAX_DURATION_MS)
    }

    for (const stmt of statements) {
      const tokens = stmt.split(/\s+/)
      const head = tokens[0]

      switch (head) {
        case 'tween': {
          const ms = parseMs(tokens[1], 'tween')
          // A new tween applies to the sets that follow: close the current step and start
          // a fresh one (lazily, on the next set) with the new duration.
          if (current) {
            if (Object.keys(current.set).length > 0) steps.push(current)
            current = null
          }
          if (ms !== null) currentTween = ms
          break
        }
        case 'hold': {
          // hold pauses AFTER a pose is reached, so it needs an open step to attach to.
          // A hold with no preceding pose (leading, or right after a `tween`) is reported
          // rather than silently dropped (CONCEPT §3).
          if (!current) {
            errors.push(
              'hold has no preceding pose to pause on; place hold after the set(s) it should follow',
            )
            break
          }
          const ms = parseMs(tokens[1], 'hold')
          if (ms !== null) current.holdMs = ms
          steps.push(current)
          current = null
          break
        }
        case 'state':
          // A read request — no geometry, no step.
          break
        case 'done':
          done = true
          break
        default: {
          // A set: `<param> <number>`.
          if (!isParamName(head)) {
            errors.push(`unknown parameter "${head}"`)
            break
          }
          if (tokens.length < 2) {
            errors.push(`${head}: missing value`)
            break
          }
          const value = Number(tokens[1])
          if (!Number.isFinite(value)) {
            errors.push(`${head}: value must be a finite number (got "${tokens[1]}")`)
            break
          }
          // Out-of-range values are CLAMPED to the parameter range (as the prompt and
          // CONCEPT §3 promise the model), not rejected. Only unknown names and
          // non-numeric values are errors.
          if (!current) current = { set: {}, tweenMs: currentTween, holdMs: 0 }
          current.set[head] = clampValue(head, value)
          break
        }
      }
    }

    // Push the final open step if it touched any parameter.
    if (current && Object.keys(current.set).length > 0) steps.push(current)

    // Bound the whole program so a many-step sequence can't stall the server's paced,
    // single-flight play loop even though each step is individually within MAX_DURATION_MS.
    if (steps.length > MAX_STEPS) {
      errors.push(`too many steps (${steps.length}); keep the sequence to ${MAX_STEPS} or fewer`)
    }
    const totalMs = steps.reduce((sum, s) => sum + s.tweenMs + s.holdMs, 0)
    if (totalMs > MAX_TOTAL_MS) {
      errors.push(`total sequence duration ${totalMs}ms exceeds the ${MAX_TOTAL_MS}ms limit`)
    }

    if (errors.length > 0) {
      return { ok: false, errors }
    }
    return { ok: true, timeline: steps, done }
  }
}
