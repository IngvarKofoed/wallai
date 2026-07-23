// face.ts — the SVG face: renders a FaceVector as geometry and plays Timelines.
//
// Mechanical, never emotional (see docs/CONCEPT.md). Every mapping here is pure
// geometry: eyelid aperture, pupil radius, brow rotation, gaze offset. The mouth is
// a STATIC neutral shape drawn once and never animated — mouth control is out of MVP
// scope. There is no smile/angry/happy anywhere; only numbers become shapes.

import type { FaceVector, ParamName } from '../core/params'
import { NEUTRAL, PARAM_NAMES, clampVector } from '../core/params'
import type { Timeline } from '../core/timeline'

// ── Pure helpers ────────────────────────────────────────────────────────────

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Clamp x into [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

/** Symmetric ease-in-out (cubic). Maps [0,1] -> [0,1]. */
export function easeInOut(t: number): number {
  const c = clamp(t, 0, 1)
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2
}

// ── Geometry model ──────────────────────────────────────────────────────────
//
// The canvas is a 360×280 viewBox. Two eyes sit side by side; two brows ride
// above them; a static neutral mouth sits below. All numbers are in view units.

const VIEW = { w: 360, h: 280 } as const

const GEO = {
  eyeCy: 122,
  leftCx: 128,
  rightCx: 232,
  eyeRx: 37, // fixed horizontal half-width
  eyeRyMax: 27, // half-height when fully open
  eyeRyMin: 2.5, // half-height when fully closed (a slit)
  irisR: 16,
  pupilRMin: 4,
  pupilRMax: 10.5,
  maxGazeX: 14, // pupil horizontal travel at |gaze.x| = 1
  maxGazeY: 12, // pupil vertical travel at |gaze.y| = 1
  browCy: 74,
  browW: 56,
  browH: 8,
  maxBrowDeg: 22, // brow rotation at |brow.angle| = 1
} as const

export interface EyeGeometry {
  cx: number
  cy: number
  rx: number
  ry: number
  irisCx: number
  irisCy: number
  pupilR: number
}

export interface BrowGeometry {
  x: number
  y: number
  cx: number
  cy: number
  rotDeg: number
}

export interface FaceGeometry {
  left: EyeGeometry
  right: EyeGeometry
  leftBrow: BrowGeometry
  rightBrow: BrowGeometry
}

function eyeGeometry(cx: number, v: FaceVector): EyeGeometry {
  const open = clamp(v['eye.open'], 0, 1)
  const pupil = clamp(v['eye.pupil'], 0, 1)
  const ry = lerp(GEO.eyeRyMin, GEO.eyeRyMax, open)
  const rx = GEO.eyeRx

  // Gaze offsets the iris within the eye. Clamp so the pupil stays inside the
  // visible aperture (which shrinks as the eye closes).
  const dxLimit = rx - GEO.irisR
  const dyLimit = Math.max(0, ry - GEO.pupilRMax * 0.5)
  const dx = clamp(v['gaze.x'] * GEO.maxGazeX, -dxLimit, dxLimit)
  const dy = clamp(-v['gaze.y'] * GEO.maxGazeY, -dyLimit, dyLimit) // +gaze.y = up = -y

  return {
    cx,
    cy: GEO.eyeCy,
    rx,
    ry,
    irisCx: cx + dx,
    irisCy: GEO.eyeCy + dy,
    pupilR: lerp(GEO.pupilRMin, GEO.pupilRMax, pupil),
  }
}

function browGeometry(cx: number, mirror: boolean, v: FaceVector): BrowGeometry {
  const angle = clamp(v['brow.angle'], -1, 1)
  // brow.angle > 0 => inner ends rotate UP. The inner end is the one nearest the
  // face centre, which is mirrored between the two brows — so the two rotations
  // are negatives of each other.
  const rot = angle * GEO.maxBrowDeg
  return {
    x: cx - GEO.browW / 2,
    y: GEO.browCy - GEO.browH / 2,
    cx,
    cy: GEO.browCy,
    rotDeg: mirror ? rot : -rot,
  }
}

/** Pure: map a full vector to the geometry of every drawn part. */
export function computeGeometry(v: FaceVector): FaceGeometry {
  return {
    left: eyeGeometry(GEO.leftCx, v),
    right: eyeGeometry(GEO.rightCx, v),
    leftBrow: browGeometry(GEO.leftCx, false, v),
    rightBrow: browGeometry(GEO.rightCx, true, v),
  }
}

// ── The face component ────────────────────────────────────────────────────────

export interface Face {
  /** Snap immediately to a vector (cancels any running animation). */
  setVector(v: FaceVector): void
  /** Animate through a timeline step by step; resolves when it finishes. */
  playTimeline(timeline: Timeline): Promise<void>
  /** Animate back to the neutral resting pose. */
  reset(): Promise<void>
  /** The current live vector. */
  getVector(): FaceVector
}

const SVG_MARKUP = `
<svg class="face-svg" viewBox="0 0 ${VIEW.w} ${VIEW.h}" role="img"
     aria-label="mechanical face" preserveAspectRatio="xMidYMid meet">
  <defs>
    <clipPath id="clip-left"><ellipse id="clip-left-e" /></clipPath>
    <clipPath id="clip-right"><ellipse id="clip-right-e" /></clipPath>
  </defs>

  <ellipse class="face-plate" cx="180" cy="140" rx="158" ry="132" />

  <rect id="brow-left" class="brow" rx="4" />
  <rect id="brow-right" class="brow" rx="4" />

  <g class="eye">
    <ellipse id="eye-left" class="sclera" />
    <g clip-path="url(#clip-left)">
      <g id="iris-left" class="iris-g">
        <circle class="iris" r="${GEO.irisR}" />
        <circle id="pupil-left" class="pupil" />
        <circle class="glint" cx="-4.5" cy="-5" r="2.4" />
      </g>
    </g>
    <ellipse id="rim-left" class="rim" />
  </g>

  <g class="eye">
    <ellipse id="eye-right" class="sclera" />
    <g clip-path="url(#clip-right)">
      <g id="iris-right" class="iris-g">
        <circle class="iris" r="${GEO.irisR}" />
        <circle id="pupil-right" class="pupil" />
        <circle class="glint" cx="-4.5" cy="-5" r="2.4" />
      </g>
    </g>
    <ellipse id="rim-right" class="rim" />
  </g>

  <path class="mouth" d="M 148 214 Q 180 217 212 214" />
</svg>`

export function createFace(container: HTMLElement): Face {
  container.innerHTML = SVG_MARKUP

  const $ = <T extends Element>(sel: string): T => {
    const el = container.querySelector<T>(sel)
    if (!el) throw new Error(`face: missing element ${sel}`)
    return el
  }

  const refs = {
    eyeLeft: $<SVGEllipseElement>('#eye-left'),
    eyeRight: $<SVGEllipseElement>('#eye-right'),
    rimLeft: $<SVGEllipseElement>('#rim-left'),
    rimRight: $<SVGEllipseElement>('#rim-right'),
    clipLeft: $<SVGEllipseElement>('#clip-left-e'),
    clipRight: $<SVGEllipseElement>('#clip-right-e'),
    irisLeft: $<SVGGElement>('#iris-left'),
    irisRight: $<SVGGElement>('#iris-right'),
    pupilLeft: $<SVGCircleElement>('#pupil-left'),
    pupilRight: $<SVGCircleElement>('#pupil-right'),
    browLeft: $<SVGRectElement>('#brow-left'),
    browRight: $<SVGRectElement>('#brow-right'),
  }

  let current: FaceVector = { ...NEUTRAL }
  let generation = 0 // bumped to cancel any in-flight animation

  function applyEye(
    eye: SVGEllipseElement,
    rim: SVGEllipseElement,
    clip: SVGEllipseElement,
    iris: SVGGElement,
    pupil: SVGCircleElement,
    g: EyeGeometry,
  ): void {
    for (const el of [eye, rim, clip]) {
      el.setAttribute('cx', String(g.cx))
      el.setAttribute('cy', String(g.cy))
      el.setAttribute('rx', String(g.rx))
      el.setAttribute('ry', String(g.ry))
    }
    iris.setAttribute('transform', `translate(${g.irisCx} ${g.irisCy})`)
    pupil.setAttribute('r', String(g.pupilR))
  }

  function applyBrow(rect: SVGRectElement, g: BrowGeometry): void {
    rect.setAttribute('x', String(g.x))
    rect.setAttribute('y', String(g.y))
    rect.setAttribute('width', String(GEO.browW))
    rect.setAttribute('height', String(GEO.browH))
    rect.setAttribute('transform', `rotate(${g.rotDeg} ${g.cx} ${g.cy})`)
  }

  function render(): void {
    const geo = computeGeometry(current)
    applyEye(refs.eyeLeft, refs.rimLeft, refs.clipLeft, refs.irisLeft, refs.pupilLeft, geo.left)
    applyEye(refs.eyeRight, refs.rimRight, refs.clipRight, refs.irisRight, refs.pupilRight, geo.right)
    applyBrow(refs.browLeft, geo.leftBrow)
    applyBrow(refs.browRight, geo.rightBrow)
  }

  function setVector(v: FaceVector): void {
    generation++ // cancel any running tween
    current = clampVector({ ...v })
    render()
  }

  function tweenStep(
    targets: Partial<Record<ParamName, number>>,
    tweenMs: number,
    gen: number,
  ): Promise<void> {
    const touched = Object.keys(targets) as ParamName[]
    const from: Partial<Record<ParamName, number>> = {}
    for (const name of touched) from[name] = current[name]

    if (tweenMs <= 0 || touched.length === 0) {
      for (const name of touched) current[name] = clampVector({ ...current, [name]: targets[name]! })[name]
      render()
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      const start = performance.now()
      const frame = (now: number): void => {
        if (gen !== generation) return resolve() // superseded
        const t = clamp((now - start) / tweenMs, 0, 1)
        const e = easeInOut(t)
        for (const name of touched) {
          current[name] = lerp(from[name]!, targets[name]!, e)
        }
        current = clampVector(current)
        render()
        if (t < 1) requestAnimationFrame(frame)
        else resolve()
      }
      requestAnimationFrame(frame)
    })
  }

  function delay(ms: number, gen: number): Promise<void> {
    if (ms <= 0) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const start = performance.now()
      const frame = (now: number): void => {
        if (gen !== generation) return resolve()
        if (now - start >= ms) resolve()
        else requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
  }

  async function playTimeline(timeline: Timeline): Promise<void> {
    const gen = ++generation
    for (const step of timeline) {
      if (gen !== generation) return
      await tweenStep(step.set as Partial<Record<ParamName, number>>, step.tweenMs, gen)
      if (gen !== generation) return
      await delay(step.holdMs, gen)
    }
  }

  function reset(): Promise<void> {
    return playTimeline([{ set: { ...NEUTRAL }, tweenMs: 300, holdMs: 0 }])
  }

  function getVector(): FaceVector {
    return { ...current }
  }

  render()
  return { setVector, playTimeline, reset, getVector }
}

// Re-export the param order for callers that want to display the vector.
export { PARAM_NAMES }
