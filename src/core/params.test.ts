import { describe, it, expect } from 'vitest'
import {
  PARAMS,
  PARAM_NAMES,
  CONTROL_NAMES,
  NEUTRAL,
  clampValue,
  clampVector,
  validate,
  isParamName,
  isControlName,
  sidesOf,
  formatVector,
  type FaceVector,
} from './params'

describe('the per-side parameter space', () => {
  it('derives two parameters (l/r) per control', () => {
    expect(PARAM_NAMES).toHaveLength(CONTROL_NAMES.length * 2)
    for (const c of CONTROL_NAMES) {
      expect(sidesOf(c)).toEqual([`${c}.l`, `${c}.r`])
      for (const side of sidesOf(c)) expect(isParamName(side)).toBe(true)
    }
  })

  it('distinguishes control base names from per-side parameter names', () => {
    expect(isControlName('eye.open')).toBe(true)
    expect(isParamName('eye.open')).toBe(false) // a bare control is not a stored parameter
    expect(isParamName('eye.open.l')).toBe(true)
    expect(isControlName('eye.open.l')).toBe(false)
    expect(isParamName('eye.wink')).toBe(false)
  })
})

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

  it('is symmetric — each side of a control shares the neutral value', () => {
    for (const c of CONTROL_NAMES) {
      const [ln, rn] = sidesOf(c)
      expect(NEUTRAL[ln]).toBe(NEUTRAL[rn])
    }
  })
})

describe('clampValue', () => {
  it('returns an in-range value unchanged', () => {
    expect(clampValue('eye.open.l', 0.5)).toBe(0.5)
    expect(clampValue('gaze.x.r', -0.3)).toBe(-0.3)
  })

  it('clamps below-min up to min', () => {
    expect(clampValue('eye.open.l', -5)).toBe(0)
    expect(clampValue('gaze.x.r', -2)).toBe(-1)
  })

  it('clamps above-max down to max', () => {
    expect(clampValue('eye.pupil.l', 5)).toBe(1)
    expect(clampValue('brow.angle.r', 2)).toBe(1)
  })

  it('falls back to the parameter neutral for a non-finite value', () => {
    expect(clampValue('eye.open.l', NaN)).toBe(PARAMS['eye.open.l'].neutral)
    expect(clampValue('gaze.x.r', Infinity)).toBe(PARAMS['gaze.x.r'].neutral)
    expect(clampValue('brow.angle.l', -Infinity)).toBe(PARAMS['brow.angle.l'].neutral)
  })
})

describe('clampVector', () => {
  it('clamps every component to its own range', () => {
    const wild: FaceVector = {
      ...NEUTRAL,
      'eye.open.l': 2,
      'eye.pupil.r': -1,
      'brow.angle.l': 5,
      'gaze.x.r': -3,
      'gaze.y.l': 0.4,
    }
    const c = clampVector(wild)
    expect(c['eye.open.l']).toBe(1)
    expect(c['eye.pupil.r']).toBe(0)
    expect(c['brow.angle.l']).toBe(1)
    expect(c['gaze.x.r']).toBe(-1)
    expect(c['gaze.y.l']).toBe(0.4)
  })

  it('replaces a non-finite component with the parameter neutral', () => {
    const v: FaceVector = { ...NEUTRAL, 'eye.open.l': NaN }
    expect(clampVector(v)['eye.open.l']).toBe(PARAMS['eye.open.l'].neutral)
  })
})

describe('validate', () => {
  it('rejects an unknown parameter name', () => {
    const r = validate('smile', 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/unknown/)
  })

  it('rejects a bare control name (validate speaks per-side parameters only)', () => {
    const r = validate('eye.open', 0.5)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/unknown/)
  })

  it('rejects a NaN value', () => {
    const r = validate('eye.open.l', NaN)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/finite/)
  })

  it('rejects a non-finite Infinity value', () => {
    const r = validate('eye.open.l', Infinity)
    expect(r.ok).toBe(false)
  })

  it('rejects a below-min value', () => {
    const r = validate('eye.open.l', -0.1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/out of range/)
  })

  it('rejects an above-max value', () => {
    const r = validate('brow.angle.r', 1.5)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/out of range/)
  })

  it('accepts an in-range value and returns it', () => {
    const r = validate('gaze.y.l', -0.5)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe(-0.5)
  })

  it('accepts values exactly at the boundaries', () => {
    expect(validate('eye.open.l', 0).ok).toBe(true)
    expect(validate('eye.open.r', 1).ok).toBe(true)
    expect(validate('gaze.x.l', -1).ok).toBe(true)
    expect(validate('gaze.x.r', 1).ok).toBe(true)
  })
})

describe('formatVector', () => {
  it('collapses a symmetric pair to the bare control name', () => {
    const s = formatVector(NEUTRAL)
    expect(s).toContain('eye.open=0.72')
    expect(s).not.toContain('eye.open.l')
  })

  it('splits a control whose two sides differ', () => {
    const winking: FaceVector = { ...NEUTRAL, 'eye.open.l': 0, 'eye.open.r': 0.9 }
    const s = formatVector(winking)
    expect(s).toContain('eye.open.l=0.00')
    expect(s).toContain('eye.open.r=0.90')
    // untouched controls still collapse
    expect(s).toContain('gaze.x=0.00')
  })
})
