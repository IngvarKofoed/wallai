import { describe, it, expect } from 'vitest'
import {
  PARAMS,
  PARAM_NAMES,
  NEUTRAL,
  clampValue,
  clampVector,
  validate,
  type FaceVector,
} from './params'

describe('NEUTRAL', () => {
  it('has an entry for every parameter, each in range and equal to its .neutral', () => {
    expect(Object.keys(NEUTRAL).sort()).toEqual([...PARAM_NAMES].sort())
    for (const name of PARAM_NAMES) {
      const { min, max, neutral } = PARAMS[name]
      expect(NEUTRAL[name]).toBe(neutral)
      expect(NEUTRAL[name]).toBeGreaterThanOrEqual(min)
      expect(NEUTRAL[name]).toBeLessThanOrEqual(max)
    }
  })
})

describe('clampValue', () => {
  it('returns an in-range value unchanged', () => {
    expect(clampValue('eye.open', 0.5)).toBe(0.5)
    expect(clampValue('gaze.x', -0.3)).toBe(-0.3)
  })

  it('clamps below-min up to min', () => {
    expect(clampValue('eye.open', -5)).toBe(0)
    expect(clampValue('gaze.x', -2)).toBe(-1)
  })

  it('clamps above-max down to max', () => {
    expect(clampValue('eye.pupil', 5)).toBe(1)
    expect(clampValue('brow.angle', 2)).toBe(1)
  })

  it('falls back to the parameter neutral for a non-finite value', () => {
    expect(clampValue('eye.open', NaN)).toBe(PARAMS['eye.open'].neutral)
    expect(clampValue('gaze.x', Infinity)).toBe(PARAMS['gaze.x'].neutral)
    expect(clampValue('brow.angle', -Infinity)).toBe(PARAMS['brow.angle'].neutral)
  })
})

describe('clampVector', () => {
  it('clamps every component to its own range', () => {
    const wild: FaceVector = {
      'eye.open': 2,
      'eye.pupil': -1,
      'brow.angle': 5,
      'gaze.x': -3,
      'gaze.y': 0.4,
    }
    expect(clampVector(wild)).toEqual({
      'eye.open': 1,
      'eye.pupil': 0,
      'brow.angle': 1,
      'gaze.x': -1,
      'gaze.y': 0.4,
    })
  })

  it('replaces a non-finite component with the parameter neutral', () => {
    const v: FaceVector = {
      'eye.open': NaN,
      'eye.pupil': 0.5,
      'brow.angle': 0,
      'gaze.x': 0,
      'gaze.y': 0,
    }
    expect(clampVector(v)['eye.open']).toBe(PARAMS['eye.open'].neutral)
  })
})

describe('validate', () => {
  it('rejects an unknown parameter name', () => {
    const r = validate('smile', 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/unknown/)
  })

  it('rejects a NaN value', () => {
    const r = validate('eye.open', NaN)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/finite/)
  })

  it('rejects a non-finite Infinity value', () => {
    const r = validate('eye.open', Infinity)
    expect(r.ok).toBe(false)
  })

  it('rejects a below-min value', () => {
    const r = validate('eye.open', -0.1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/out of range/)
  })

  it('rejects an above-max value', () => {
    const r = validate('brow.angle', 1.5)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/out of range/)
  })

  it('accepts an in-range value and returns it', () => {
    const r = validate('gaze.y', -0.5)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe(-0.5)
  })

  it('accepts values exactly at the boundaries', () => {
    expect(validate('eye.open', 0).ok).toBe(true)
    expect(validate('eye.open', 1).ok).toBe(true)
    expect(validate('gaze.x', -1).ok).toBe(true)
    expect(validate('gaze.x', 1).ok).toBe(true)
  })
})
