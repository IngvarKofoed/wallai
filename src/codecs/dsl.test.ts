import { describe, it, expect } from 'vitest'
import { DslCodec } from './dsl'
import { DEFAULT_TWEEN_MS } from '../core/timeline'
import type { ModelOutput } from '../core/llm-types'

const codec = new DslCodec()

const out = (text: string): ModelOutput => ({ text })

const block = (body: string): string => '```face\n' + body + '\n```'

describe('DslCodec.describe', () => {
  const { instructions, tools } = codec.describe()

  it('is a text codec (no tools)', () => {
    expect(tools).toBeUndefined()
  })

  it('teaches the fenced `face` block and the grammar keywords', () => {
    expect(instructions).toContain('```face')
    expect(instructions).toContain('tween')
    expect(instructions).toContain('hold')
    expect(instructions).toContain('state')
    expect(instructions).toContain('done')
  })

  it('documents every parameter with its range, generated from PARAMS', () => {
    expect(instructions).toContain('eye.open')
    expect(instructions).toContain('eye.pupil')
    expect(instructions).toContain('brow.angle')
    expect(instructions).toContain('gaze.x')
    expect(instructions).toContain('gaze.y')
  })

  it('stays mechanical, never emotional', () => {
    expect(instructions.toLowerCase()).not.toMatch(/smile|angry|happy/)
  })
})

describe('DslCodec.parse — single pose', () => {
  it('parses a single pose into a one-step timeline', () => {
    const result = codec.parse(
      out(
        block(
          [
            'tween 350',
            'brow.angle 1.0',
            'eye.open 1.0',
            'eye.pupil 0.7',
            'gaze.y 0.2',
            'state',
          ].join('\n'),
        ),
      ),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.timeline).toHaveLength(1)
    expect(result.timeline[0]).toEqual({
      set: { 'brow.angle': 1.0, 'eye.open': 1.0, 'eye.pupil': 0.7, 'gaze.y': 0.2 },
      tweenMs: 350,
      holdMs: 0,
    })
    expect(result.done).toBe(false)
  })

  it('applies the default tween when none is given', () => {
    const result = codec.parse(out(block('gaze.x 0.5')))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.timeline).toHaveLength(1)
    expect(result.timeline[0].tweenMs).toBe(DEFAULT_TWEEN_MS)
  })
})

describe('DslCodec.parse — timed sequence', () => {
  it('parses a two-step sequence with tween + hold', () => {
    const result = codec.parse(
      out(
        block(
          [
            'tween 120 ; gaze.x -0.8 ; eye.open 0.5 ; brow.angle -0.3',
            'hold 500',
            'tween 300 ; gaze.x 0 ; eye.open 0.8 ; brow.angle 0',
            'done',
          ].join('\n'),
        ),
      ),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.timeline).toHaveLength(2)
    expect(result.timeline[0]).toEqual({
      set: { 'gaze.x': -0.8, 'eye.open': 0.5, 'brow.angle': -0.3 },
      tweenMs: 120,
      holdMs: 500,
    })
    expect(result.timeline[1]).toEqual({
      set: { 'gaze.x': 0, 'eye.open': 0.8, 'brow.angle': 0 },
      tweenMs: 300,
      holdMs: 0,
    })
    expect(result.done).toBe(true)
  })
})

describe('DslCodec.parse — validation', () => {
  it('rejects an unknown parameter name', () => {
    const result = codec.parse(out(block('eye.wink 0.5')))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('eye.wink')
  })

  it('clamps an out-of-range value instead of rejecting the program', () => {
    const result = codec.parse(out(block('eye.open 1.5\ngaze.x -9')))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.timeline[0].set['eye.open']).toBe(1)
    expect(result.timeline[0].set['gaze.x']).toBe(-1)
  })

  it('rejects a non-numeric value', () => {
    const result = codec.parse(out(block('gaze.x left')))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('reports a hold with no preceding pose instead of silently dropping it', () => {
    const result = codec.parse(out(block('tween 200\nhold 300\ngaze.x 0')))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toContain('hold')
  })

  it('clamps an over-long tween/hold duration', () => {
    const result = codec.parse(out(block('tween 999999999\ngaze.x 0.5\nhold 999999999')))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.timeline[0].tweenMs).toBe(10000)
    expect(result.timeline[0].holdMs).toBe(10000)
  })

  it('rejects a negative tween/hold duration', () => {
    const result = codec.parse(out(block('tween -100\ngaze.x 0.5')))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toContain('negative')
  })

  it('rejects a sequence whose total duration exceeds the limit', () => {
    // Each step is within the per-step cap, but many steps sum past the whole-program limit.
    const lines: string[] = []
    for (let i = 0; i < 10; i++) lines.push('tween 10000 ; gaze.x 0 ; hold 10000')
    const result = codec.parse(out(block(lines.join('\n'))))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.includes('exceeds') || e.includes('too many'))).toBe(true)
  })
})

describe('DslCodec.parse — done and empty programs', () => {
  it('detects a done statement', () => {
    const result = codec.parse(out(block('gaze.x 0.3\ndone')))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.done).toBe(true)
  })

  it('accepts an empty program (only state/done) with an empty timeline', () => {
    const result = codec.parse(out(block('state\ndone')))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.timeline).toHaveLength(0)
    expect(result.done).toBe(true)
  })
})

describe('DslCodec.parse — extraction', () => {
  it('parses only the fenced block when there is prose around it', () => {
    const text = [
      "I'll narrow the eyes and tilt the brows down for suspicion.",
      '',
      block('gaze.x 0.4\neye.open 0.4'),
      '',
      'That should read as wary.',
    ].join('\n')

    const result = codec.parse(out(text))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.timeline).toHaveLength(1)
    expect(result.timeline[0].set).toEqual({ 'gaze.x': 0.4, 'eye.open': 0.4 })
  })

  it('uses the LAST face block when several are present', () => {
    const text = [block('gaze.x -1'), 'reconsidering...', block('gaze.x 1')].join('\n\n')
    const result = codec.parse(out(text))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.timeline).toHaveLength(1)
    expect(result.timeline[0].set).toEqual({ 'gaze.x': 1 })
  })

  it('parses the whole text leniently when there is no fenced block', () => {
    const result = codec.parse(out('gaze.x 0.2\neye.open 0.9'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.timeline).toHaveLength(1)
    expect(result.timeline[0].set).toEqual({ 'gaze.x': 0.2, 'eye.open': 0.9 })
  })
})
