import { describe, it, expect } from 'vitest'
import { Orchestrator } from './orchestrator'
import { FaceState } from './faceState'
import { DslCodec } from '../codecs/dsl'
import type { ServerMessage } from './protocol'
import type { ModelOutput } from './llm-types'
import type { LlmProvider, LlmRunInput } from '../llm/provider'
import type { Renderer } from '../render/renderer'
import type { Timeline } from './timeline'

const out = (text: string): ModelOutput => ({ text })
const block = (body: string): string => '```face\n' + body + '\n```'

/** Scripted provider that records the exact input it was called with (deep-copied, since
 *  the orchestrator mutates its messages array between turns). Repeats the last script for
 *  any turns beyond the script length. */
class FakeLlm implements LlmProvider {
  readonly id = 'fake'
  readonly calls: LlmRunInput[] = []
  constructor(private readonly scripts: ModelOutput[]) {}
  async run(input: LlmRunInput): Promise<ModelOutput> {
    this.calls.push({
      system: input.system,
      messages: input.messages.map((m) => ({ ...m })),
      tools: input.tools,
    })
    return this.scripts[Math.min(this.calls.length - 1, this.scripts.length - 1)]
  }
}

class FakeRenderer implements Renderer {
  readonly id = 'fake'
  readonly played: Timeline[] = []
  async play(timeline: Timeline): Promise<void> {
    this.played.push(timeline)
  }
  async reset(): Promise<void> {}
}

function harness(scripts: ModelOutput[], maxTurns?: number) {
  const llm = new FakeLlm(scripts)
  const renderer = new FakeRenderer()
  const faceState = new FaceState()
  const events: ServerMessage[] = []
  const orchestrator = new Orchestrator({
    llm,
    codec: new DslCodec(),
    renderer,
    faceState,
    maxTurns,
  })
  const emit = (m: ServerMessage): void => {
    events.push(m)
  }
  return { llm, renderer, faceState, events, orchestrator, emit }
}

describe('Orchestrator.run', () => {
  it('applies a program, ends on done, and returns the settled vector', async () => {
    const h = harness([out(block('gaze.x 1\ndone'))])
    const final = await h.orchestrator.run('curious', h.emit)
    // `gaze.x 1` is symmetric shorthand — it sets both eyes.
    expect(final['gaze.x.l']).toBe(1)
    expect(final['gaze.x.r']).toBe(1)
    expect(h.llm.calls).toHaveLength(1)
    expect(h.renderer.played).toHaveLength(1)
    expect(h.events.at(-1)).toEqual({ type: 'runEnded', finalVector: final })
  })

  it('never sends an empty-content assistant message back to the model', async () => {
    // First turn yields no text; without the guard this would push an empty assistant
    // message that the Messages API rejects on the second turn.
    const h = harness([out(''), out(block('gaze.x 0.5\ndone'))])
    await h.orchestrator.run('sleepy', h.emit)
    expect(h.llm.calls).toHaveLength(2)
    for (const call of h.llm.calls) {
      for (const m of call.messages) {
        if (m.role === 'assistant') expect(m.content.length).toBeGreaterThan(0)
      }
    }
  })

  it('stops at maxTurns when the model never signals done', async () => {
    const h = harness([out(block('gaze.x 0.1'))], 3)
    await h.orchestrator.run('curious', h.emit)
    expect(h.llm.calls).toHaveLength(3)
  })

  it('announces the current pose in the first message when continuing without a reset', async () => {
    const h = harness([out(block('gaze.x 1\ndone'))])
    // Simulate the pose a skipped-reset run carries in from the previous run. Both sides
    // share a value, so formatVector reports the collapsed (symmetric) control name.
    h.faceState.apply([
      {
        set: { 'gaze.x.l': -0.8, 'gaze.x.r': -0.8, 'eye.open.l': 0.3, 'eye.open.r': 0.3 },
        tweenMs: 0,
        holdMs: 0,
      },
    ])
    await h.orchestrator.run('suspicious', h.emit, { announceStartPose: true })
    const first = h.llm.calls[0].messages[0]
    expect(first.role).toBe('user')
    expect(first.content).toContain('currently reads')
    expect(first.content).toContain('gaze.x=-0.80')
    expect(first.content).toContain('eye.open=0.30')
  })

  it('omits the pose announcement on a normal (reset) run', async () => {
    const h = harness([out(block('gaze.x 1\ndone'))])
    await h.orchestrator.run('curious', h.emit)
    expect(h.llm.calls[0].messages[0].content).not.toContain('currently reads')
  })

  it('feeds parse errors back and continues the loop', async () => {
    const h = harness([out(block('eye.wink 1')), out(block('gaze.x 0.2\ndone'))])
    await h.orchestrator.run('suspicious', h.emit)
    const errors = h.events.filter(
      (e) => e.type === 'transcript' && e.kind === 'error',
    )
    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(h.llm.calls).toHaveLength(2)
  })
})
