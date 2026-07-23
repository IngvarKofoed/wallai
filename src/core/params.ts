// params.ts — the ONE home for the parameter space.
//
// See CONCEPT.md "mechanical, not emotional": every parameter describes geometry
// (how open, how dilated, how rotated, where pointed) and NEVER an emotion. There is
// deliberately no smile/angry/happy knob anywhere — emotional vocabulary lives only in
// the prompt we give the model, never in the controls the model is given.

export const PARAMS = {
  'eye.open':   { min: 0,  max: 1,  neutral: 0.72, describe: 'eyelid aperture: 0 fully closed to 1 wide open' },
  'eye.pupil':  { min: 0,  max: 1,  neutral: 0.5,  describe: 'pupil diameter: 0 constricted to 1 fully dilated' },
  'brow.angle': { min: -1, max: 1,  neutral: 0,    describe: 'brow tilt: -1 inner ends rotated down, 0 level, 1 inner ends rotated up' },
  'gaze.x':     { min: -1, max: 1,  neutral: 0,    describe: 'eyes horizontal: -1 full left, 0 center, 1 full right (viewer perspective)' },
  'gaze.y':     { min: -1, max: 1,  neutral: 0,    describe: 'eyes vertical: -1 looking down, 0 center, 1 looking up' },
} as const

export type ParamName = keyof typeof PARAMS
export type FaceVector = Record<ParamName, number>
export type PartialVector = Partial<FaceVector>

/** Every parameter name, in declaration order. Typed `Object.keys(PARAMS)`. */
export const PARAM_NAMES: ParamName[] = Object.keys(PARAMS) as ParamName[]

/** The neutral resting pose, built from each parameter's `.neutral`. */
export const NEUTRAL: FaceVector = Object.fromEntries(
  PARAM_NAMES.map((name) => [name, PARAMS[name].neutral]),
) as FaceVector

/** Type guard: is `s` a known parameter name? */
export function isParamName(s: string): s is ParamName {
  return Object.prototype.hasOwnProperty.call(PARAMS, s)
}

/** Clamp a value to the given parameter's [min, max] range. A non-finite value
 *  (NaN/Infinity) has no meaningful clamp, so it falls back to the parameter's neutral —
 *  guaranteeing this always returns a finite, in-range number. */
export function clampValue(name: ParamName, v: number): number {
  const { min, max, neutral } = PARAMS[name]
  if (!Number.isFinite(v)) return neutral
  if (v < min) return min
  if (v > max) return max
  return v
}

/** Clamp every component of a full vector to its parameter range. */
export function clampVector(v: FaceVector): FaceVector {
  return Object.fromEntries(
    PARAM_NAMES.map((name) => [name, clampValue(name, v[name])]),
  ) as FaceVector
}

/**
 * Validate a single (name, value) assignment. Fails for an unknown parameter name,
 * a non-finite value (NaN/Infinity), or a value outside the parameter's range.
 */
export function validate(
  name: string,
  v: number,
): { ok: true; value: number } | { ok: false; error: string } {
  if (!isParamName(name)) {
    return { ok: false, error: `unknown parameter "${name}"` }
  }
  if (!Number.isFinite(v)) {
    return { ok: false, error: `${name}: value must be a finite number` }
  }
  const { min, max } = PARAMS[name]
  if (v < min || v > max) {
    return { ok: false, error: `${name}: ${v} out of range [${min}, ${max}]` }
  }
  return { ok: true, value: v }
}

/**
 * Human-readable one-line rendering of a full vector, e.g.
 * "eye.open=0.72 eye.pupil=0.50 brow.angle=0.00 gaze.x=0.00 gaze.y=0.00".
 */
export function formatVector(v: FaceVector): string {
  return PARAM_NAMES.map((name) => `${name}=${v[name].toFixed(2)}`).join(' ')
}
