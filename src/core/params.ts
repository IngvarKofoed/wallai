// params.ts — the ONE home for the parameter space.
//
// See CONCEPT.md "mechanical, not emotional": every parameter describes geometry (how
// open, how dilated, how rotated, where pointed) and NEVER an emotion. There is
// deliberately no smile/angry/happy knob anywhere — emotional vocabulary lives only in
// the prompt we give the model, never in the controls the model is given.
//
// Every control exists PER SIDE (viewer's left / right), so the face can be asymmetric —
// a wink, one brow cocked. A control's geometry, range, and neutral are defined ONCE in
// CONTROLS; the two per-side parameters (`.l` / `.r`) are derived from CONTROLS × SIDES.
// The symmetric shorthand (write `eye.open` to set both sides) is a DSL convenience that
// lives in the codec, not here — this module speaks only per-side ParamNames.

/** The two sides, from the VIEWER's perspective — matching gaze.x (`-1` = viewer's left).
 *  So side `l` is the eye/brow drawn on the left of the screen. */
export const SIDES = ['l', 'r'] as const
export type Side = (typeof SIDES)[number]

/** The logical controls — each one geometric quantity that exists once per side. Range,
 *  neutral, and description are side-independent (the two eyes/brows are identical in
 *  construction), so a new control is added here and its per-side parameters, clamping,
 *  and prompt text all follow automatically. */
export const CONTROLS = {
  'eye.open':   { min: 0,  max: 1,  neutral: 0.72, describe: 'eyelid aperture: 0 fully closed to 1 wide open' },
  'eye.pupil':  { min: 0,  max: 1,  neutral: 0.5,  describe: 'pupil diameter: 0 constricted to 1 fully dilated' },
  'brow.angle': { min: -1, max: 1,  neutral: 0,    describe: 'brow tilt: -1 inner end rotated down, 0 level, 1 inner end rotated up' },
  'gaze.x':     { min: -1, max: 1,  neutral: 0,    describe: 'horizontal eye direction: -1 full left, 0 center, 1 full right (viewer perspective)' },
  'gaze.y':     { min: -1, max: 1,  neutral: 0,    describe: 'vertical eye direction: -1 looking down, 0 center, 1 looking up' },
} as const

export type ControlName = keyof typeof CONTROLS

/** Every control name, in declaration order. */
export const CONTROL_NAMES: ControlName[] = Object.keys(CONTROLS) as ControlName[]

interface ParamSpec {
  min: number
  max: number
  neutral: number
  describe: string
}

/** A parameter name is a control paired with a side, e.g. `eye.open.l`. */
export type ParamName = `${ControlName}.${Side}`

/** The per-side parameter space — the clamp/validate/neutral home. Derived from
 *  CONTROLS × SIDES (grouped by control, `l` then `r`), so it never drifts from CONTROLS. */
export const PARAMS = Object.fromEntries(
  CONTROL_NAMES.flatMap((c) => SIDES.map((s) => [`${c}.${s}`, { ...CONTROLS[c] }] as const)),
) as Record<ParamName, ParamSpec>

export type FaceVector = Record<ParamName, number>
export type PartialVector = Partial<FaceVector>

/** Every parameter name, in declaration order. Typed `Object.keys(PARAMS)`. */
export const PARAM_NAMES: ParamName[] = Object.keys(PARAMS) as ParamName[]

/** The neutral resting pose, built from each parameter's `.neutral`. */
export const NEUTRAL: FaceVector = Object.fromEntries(
  PARAM_NAMES.map((name) => [name, PARAMS[name].neutral]),
) as FaceVector

/** The two per-side parameter names for a control, e.g. `eye.open` → `['eye.open.l', 'eye.open.r']`. */
export function sidesOf(control: ControlName): ParamName[] {
  return SIDES.map((s) => `${control}.${s}` as ParamName)
}

/** Type guard: is `s` a known per-side parameter name (e.g. `eye.open.l`)? */
export function isParamName(s: string): s is ParamName {
  return Object.prototype.hasOwnProperty.call(PARAMS, s)
}

/** Type guard: is `s` a known control base name (e.g. `eye.open`)? These are NOT
 *  parameters the core stores — the DSL treats a bare control as shorthand for both sides. */
export function isControlName(s: string): s is ControlName {
  return Object.prototype.hasOwnProperty.call(CONTROLS, s)
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
 * Operates on per-side ParamNames only; control shorthand is resolved by the codec first.
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
 * Human-readable one-line rendering of a full vector. Symmetric pairs collapse to the
 * bare control name (matching the DSL's symmetric shorthand), so a symmetric face reads
 * "eye.open=0.72 ..."; only a side that differs from its partner splits, e.g. a wink
 * reads "... eye.open.l=0.00 eye.open.r=0.90 ...". This keeps the state the model reads
 * back in the same vocabulary it writes.
 */
export function formatVector(v: FaceVector): string {
  return CONTROL_NAMES.map((c) => {
    const [ln, rn] = sidesOf(c)
    return v[ln] === v[rn]
      ? `${c}=${v[ln].toFixed(2)}`
      : `${ln}=${v[ln].toFixed(2)} ${rn}=${v[rn].toFixed(2)}`
  }).join(' ')
}
