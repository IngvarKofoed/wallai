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
    const initial: FaceVector = { ...NEUTRAL, 'eye.open.l': 0.3 }
    const fs = new FaceState(initial)
    initial['eye.open.l'] = 0.9
    expect(fs.current()['eye.open.l']).toBe(0.3)
  })
})

describe('apply — fold order', () => {
  it('applies sets in order across steps, last write wins per param', () => {
    const fs = new FaceState()
    const t: Timeline = [
      step({ 'gaze.x.l': -0.8, 'eye.open.l': 0.5 }),
      step({ 'gaze.x.l': 0.0 }),
      step({ 'eye.open.l': 1.0, 'brow.angle.l': 0.4 }),
    ]
    const result = fs.apply(t)
    expect(result['gaze.x.l']).toBe(0.0)
    expect(result['eye.open.l']).toBe(1.0)
    expect(result['brow.angle.l']).toBe(0.4)
    // untouched param keeps its neutral value
    expect(result['gaze.y.l']).toBe(NEUTRAL['gaze.y.l'])
  })

  it('last write wins within the same step ordering across steps', () => {
    const fs = new FaceState()
    fs.apply([step({ 'eye.pupil.l': 0.2 }), step({ 'eye.pupil.l': 0.9 })])
    expect(fs.current()['eye.pupil.l']).toBe(0.9)
  })

  it('accumulates across successive apply calls', () => {
    const fs = new FaceState()
    fs.apply([step({ 'gaze.x.l': 0.5 })])
    fs.apply([step({ 'gaze.y.l': -0.5 })])
    expect(fs.current()['gaze.x.l']).toBe(0.5)
    expect(fs.current()['gaze.y.l']).toBe(-0.5)
  })

  it('folds the two sides of a control independently', () => {
    const fs = new FaceState()
    fs.apply([step({ 'eye.open.l': 0, 'eye.open.r': 0.9 })])
    expect(fs.current()['eye.open.l']).toBe(0)
    expect(fs.current()['eye.open.r']).toBe(0.9)
  })
})

describe('apply — clamping', () => {
  it('clamps folded values into range', () => {
    const fs = new FaceState()
    const result = fs.apply([
      step({ 'eye.open.l': 5, 'gaze.x.l': -3, 'brow.angle.l': 2 }),
    ])
    expect(result['eye.open.l']).toBe(1)
    expect(result['gaze.x.l']).toBe(-1)
    expect(result['brow.angle.l']).toBe(1)
  })
})

describe('apply / current — copies', () => {
  it('apply returns a copy that is not the internal state', () => {
    const fs = new FaceState()
    const returned = fs.apply([step({ 'eye.open.l': 0.4 })])
    returned['eye.open.l'] = 0.99
    expect(fs.current()['eye.open.l']).toBe(0.4)
  })

  it('current returns a fresh copy each call', () => {
    const fs = new FaceState()
    const a = fs.current()
    const b = fs.current()
    expect(a).not.toBe(b)
    a['eye.open.l'] = 0.01
    expect(fs.current()['eye.open.l']).toBe(NEUTRAL['eye.open.l'])
  })
})

describe('reset', () => {
  it('returns to a copy of NEUTRAL after changes', () => {
    const fs = new FaceState()
    fs.apply([step({ 'eye.open.l': 0.1, 'gaze.x.l': 0.9 })])
    fs.reset()
    expect(fs.current()).toEqual(NEUTRAL)
    expect(fs.current()).not.toBe(NEUTRAL)
  })
})
