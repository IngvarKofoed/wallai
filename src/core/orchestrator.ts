// orchestrator.ts — the loop (ARCHITECTURE §7). Default mode is multi-turn refine:
// the model expresses, reads the confirmed numeric state, adjusts, and ends by emitting
// a codec-native `done` signal, bounded by maxTurns. The orchestrator wires the three
// seams (LLM provider, codec, renderer) around the authoritative FaceState.

import type { ServerMessage } from './protocol'
import type { FaceVector } from './params'
import type { ChatMessage } from './llm-types'
import type { Timeline } from './timeline'
import type { LlmProvider } from '../llm/provider'
import type { Codec } from '../codecs/codec'
import type { Renderer } from '../render/renderer'
import type { FaceState } from './faceState'
import { formatVector } from './params'
import { buildSystemPrompt } from './prompt'

export interface OrchestratorDeps {
  llm: LlmProvider
  codec: Codec
  renderer: Renderer
  faceState: FaceState
  maxTurns?: number
}

/** Render a timeline human-readably: one line per step — the set entries as name=value,
 *  plus the step's tween and (when present) hold. Not raw JSON. */
function renderTimeline(timeline: Timeline): string {
  return timeline
    .map((step) => {
      const sets = Object.entries(step.set)
        .map(([name, value]) => `${name}=${value}`)
        .join(' ')
      let line = `tween ${step.tweenMs}ms`
      if (sets) line += ` | ${sets}`
      if (step.holdMs > 0) line += ` | hold ${step.holdMs}ms`
      return line
    })
    .join('\n')
}

export class Orchestrator {
  private readonly llm: LlmProvider
  private readonly codec: Codec
  private readonly renderer: Renderer
  private readonly faceState: FaceState
  private readonly maxTurns: number

  constructor(deps: OrchestratorDeps) {
    this.llm = deps.llm
    this.codec = deps.codec
    this.renderer = deps.renderer
    this.faceState = deps.faceState
    this.maxTurns = deps.maxTurns ?? 4
  }

  async run(
    userPrompt: string,
    emit: (m: ServerMessage) => void,
  ): Promise<FaceVector> {
    const contribution = this.codec.describe()
    const system = buildSystemPrompt(contribution)
    const tools = contribution.tools

    const messages: ChatMessage[] = [
      { role: 'user', content: userPrompt + '\n\nExpress this with the face.' },
    ]

    emit({ type: 'runStarted', prompt: userPrompt })

    for (let turn = 0; turn < this.maxTurns; turn++) {
      const output = await this.llm.run({ system, messages, tools })
      const text = output.text ?? ''
      // The Messages API rejects an assistant turn with empty content, so never echo an
      // empty model response back into the history — substitute a placeholder to keep the
      // conversation well-formed (an empty response yields an empty timeline below anyway).
      messages.push({ role: 'assistant', content: text.trim() ? text : '(no command emitted)' })
      if (text.trim()) emit({ type: 'transcript', kind: 'reasoning', text })

      const parsed = this.codec.parse(output)
      if (!parsed.ok) {
        const errors = parsed.errors.join('; ')
        emit({ type: 'transcript', kind: 'error', text: errors })
        messages.push({
          role: 'user',
          content: 'Those commands had errors: ' + errors + '. Fix them and resend.',
        })
        continue
      }

      if (parsed.timeline.length) {
        emit({ type: 'transcript', kind: 'program', text: renderTimeline(parsed.timeline) })
        this.faceState.apply(parsed.timeline)
        await this.renderer.play(parsed.timeline)
      }

      const vec = this.faceState.current()
      emit({ type: 'state', vector: vec })
      messages.push({
        role: 'user',
        content:
          'Current face state: ' +
          formatVector(vec) +
          '. Refine further, or write done if satisfied.',
      })

      if (parsed.done) break
    }

    const finalVec = this.faceState.current()
    emit({ type: 'runEnded', finalVector: finalVec })
    return finalVec
  }
}
