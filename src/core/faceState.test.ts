import { describe, it, expect } from 'vitest'
import { FaceState } from './faceState'
import { NEUTRAL, type FaceVector } from './params'
import type { Timeline } from './timeline'

function step(set: Partial<FaceVector>, tweenMs = 250, holdMs = 0) {
  return { set, tweenMs, holdMs }
}

describe('FaceState construction', () => {
  it('defaults to a copy of NEUTRAL', () => {
    const fs = new FaceState()
    expect(fs.current()).toEqual(NEUTRAL)
    expect(fs.current()).not.toBe(NEUTRAL)
  })

  it('does not alias the initial vector passed in', () => {
    const initial: FaceVector = { ...NEUTRAL, 'eye.open': 0.3 }
    const fs = new FaceState(initial)
    initial['eye.open'] = 0.9
    expect(fs.current()['eye.open']).toBe(0.3)
  })
})

describe('apply — fold order', () => {
  it('applies sets in order across steps, last write wins per param', () => {
    const fs = new FaceState()
    const t: Timeline = [
      step({ 'gaze.x': -0.8, 'eye.open': 0.5 }),
      step({ 'gaze.x': 0.0 }),
      step({ 'eye.open': 1.0, 'brow.angle': 0.4 }),
    ]
    const result = fs.apply(t)
    expect(result['gaze.x']).toBe(0.0)
    expect(result['eye.open']).toBe(1.0)
    expect(result['brow.angle']).toBe(0.4)
    // untouched param keeps its neutral value
    expect(result['gaze.y']).toBe(NEUTRAL['gaze.y'])
  })

  it('last write wins within the same step ordering across steps', () => {
    const fs = new FaceState()
    fs.apply([step({ 'eye.pupil': 0.2 }), step({ 'eye.pupil': 0.9 })])
    expect(fs.current()['eye.pupil']).toBe(0.9)
  })

  it('accumulates across successive apply calls', () => {
    const fs = new FaceState()
    fs.apply([step({ 'gaze.x': 0.5 })])
    fs.apply([step({ 'gaze.y': -0.5 })])
    expect(fs.current()['gaze.x']).toBe(0.5)
    expect(fs.current()['gaze.y']).toBe(-0.5)
  })
})

describe('apply — clamping', () => {
  it('clamps folded values into range', () => {
    const fs = new FaceState()
    const result = fs.apply([
      step({ 'eye.open': 5, 'gaze.x': -3, 'brow.angle': 2 }),
    ])
    expect(result['eye.open']).toBe(1)
    expect(result['gaze.x']).toBe(-1)
    expect(result['brow.angle']).toBe(1)
  })
})

describe('apply / current — copies', () => {
  it('apply returns a copy that is not the internal state', () => {
    const fs = new FaceState()
    const returned = fs.apply([step({ 'eye.open': 0.4 })])
    returned['eye.open'] = 0.99
    expect(fs.current()['eye.open']).toBe(0.4)
  })

  it('current returns a fresh copy each call', () => {
    const fs = new FaceState()
    const a = fs.current()
    const b = fs.current()
    expect(a).not.toBe(b)
    a['eye.open'] = 0.01
    expect(fs.current()['eye.open']).toBe(NEUTRAL['eye.open'])
  })
})

describe('reset', () => {
  it('returns to a copy of NEUTRAL after changes', () => {
    const fs = new FaceState()
    fs.apply([step({ 'eye.open': 0.1, 'gaze.x': 0.9 })])
    fs.reset()
    expect(fs.current()).toEqual(NEUTRAL)
    expect(fs.current()).not.toBe(NEUTRAL)
  })
})
