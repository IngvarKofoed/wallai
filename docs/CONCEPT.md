# CONCEPT — Facial Expression Simulator (`wallai`)

## One-line pitch

A minimal, well-defined **face** — two eyes and a mouth — that an LLM drives with a
tiny command language, so we can watch whether a language model can *act*: turn a
feeling or a situation into a believable expression.

## The question we're actually exploring

LLMs are fluent with words *about* emotion. This project asks a narrower, more physical
question:

> Given only a small set of muscle-like controls (how open the eyes are, how big the
> pupils are, how the brows tilt, where the eyes look) and a **feeling** or a
> **situation** to convey — can an LLM map that internal understanding onto the right
> configuration of a face?

Everything here exists to make that mapping observable. The face is deliberately simple
so that a "correct" expression is a matter of choosing values, not of art.

## Design principle: mechanical, not emotional

**The parameters describe geometry, never emotion.** A control is always *how open*,
*how dilated*, *how rotated*, *where pointed* — never `smile`, `angry`, or `surprised`.

This is the load-bearing rule of the whole project. The moment a parameter is named
`smile`, we have done the emotion → geometry mapping *for* the model — which is exactly
the capability we are trying to test. Emotional vocabulary lives only in the **prompt we
give the model** ("you feel embarrassed"), never in the **controls the model is given**.

Corollaries:

- Endpoints are described physically ("inner brow ends lowered," not "furrowed/angry").
- No preset expressions, no `mood` knob, no shortcut that encodes an emotion.
- If a proposed parameter can't be described without naming a feeling, it doesn't belong.

## The three parts

### 1. The Face — a bounded parameter vector

An expression is nothing more than a point in a small, named, bounded space. There are
no free-form drawings; every possible face is one assignment of these values:

| Control      | Range      | Meaning (purely geometric)                                   |
| ------------ | ---------- | ------------------------------------------------------------ |
| `eye.open`   | `0 … 1`    | eyelid aperture: `0` fully closed → `1` wide open            |
| `eye.pupil`  | `0 … 1`    | pupil diameter: `0` constricted → `1` fully dilated          |
| `brow.angle` | `-1 … 1`   | brow tilt: `-1` inner end rotated down → `0` level → `1` inner end rotated up |
| `gaze.x`     | `-1 … 1`   | horizontal eye direction: `-1` full left → `0` center → `1` full right (viewer's perspective) |
| `gaze.y`     | `-1 … 1`   | vertical eye direction: `-1` looking down → `0` center → `1` looking up |

**Each control exists independently for the left and right side** (viewer's perspective),
so the actual parameter vector is ten values: `<control>.l` and `<control>.r` — e.g.
`eye.open.l`, `brow.angle.r`. This is what lets the face be asymmetric: a wink, a single
cocked brow, an uneven squint, a sideways-only glance. In the DSL the **bare control name
is symmetric shorthand** that sets both sides at once (`eye.open 0.6` opens both eyes), so
the common symmetric case stays a short pose; `.l` / `.r` address one side.

Design rules for the parameter space:

- **Mechanical, not emotional.** See the principle above — this is rule zero.
- **Named and bounded.** Every value has a clamp range; the simulator never renders an
  out-of-range value.
- **Per-side, symmetric by convention.** Every control has a `.l` and a `.r` parameter, but
  the DSL shorthand sets both together, so a face is symmetric unless the model *chooses* to
  split a side. A control's range, neutral, and geometry are defined once and shared by both
  sides — asymmetry is in the *values*, never a separate "wink" or "smirk" knob.
- **Continuous.** Values are real numbers, so expressions can be subtle, not just
  presets. The model picks `0.62`, not just "open" or "closed."

**The mouth is deferred (post-MVP).** The face still *renders* a mouth so it reads as a
face — but as a **static, neutral** shape with no controls in the MVP. Mouth control is
harder (SVG shape-morphing, and more parameters) and is the first planned expansion; see
*Future directions*. The MVP tests expression through **eyes and brows alone**, which is
a legitimately interesting constraint — a great deal of affect lives above the nose.

### 2. The Simulator — render, animate, report

A web page (browser + **SVG**) that does three things:

1. **Render** the current parameter vector as a face — two eyes, two brows, and a static
   neutral mouth.
2. **Animate** by *tweening* smoothly from the current vector to a new target vector over
   a given duration, rather than snapping. This is what makes an expression read as a
   *movement* ("the brows shot up," "the eyes darted away") rather than a static icon.
3. **Report** its current state — the exact parameter vector at any moment — as text, so
   the driving loop always knows where the face is.

The simulator is the single source of truth for "what the face looks like right now."

### 3. The Control DSL — how the LLM drives the face

The model writes a **tiny command language** — compact, human-readable, trivially parsed.

We chose a DSL over JSON or MCP tool-calls deliberately:

- **It's native territory for an LLM.** Models write small scripting languages fluently,
  especially one this size taught in the system prompt.
- **It expresses movement over time.** Its real advantage over a single JSON pose or one
  tool-call is a **timeline**: with `tween` (how fast) and `hold` (pause), the model
  choreographs a *sequence* of poses in one shot — a blink, a double-take, an averted
  glance that settles. That temporal richness is the point of a project about
  expression-*as-movement*. (For a single static pose, DSL and JSON are equivalent; the
  DSL earns its keep on sequences.)

```text
# a single pose
tween 350            # ms to animate toward the targets that follow
brow.angle 1.0       # brows rotated up
eye.open 1.0         # eyes wide
eye.pupil 0.7        # pupils dilated
gaze.y 0.2           # looking very slightly up
state                # ask the simulator to report the current vector

# a timed sequence — a wary glance to the left that relaxes
tween 120 ; gaze.x -0.8 ; eye.open 0.5 ; brow.angle -0.3
hold 500
tween 300 ; gaze.x 0 ; eye.open 0.8 ; brow.angle 0

# an asymmetric pose — a wink with a single cocked brow
tween 200
eye.open.l 0         # close only the left eye
eye.open.r 0.9       # right eye stays open
brow.angle.r 0.4     # tilt only the right brow up
```

Grammar sketch (v1):

```text
program    := statement ( (";" | newline) statement )*
statement  := set | tween | hold | state | done | comment
set        := PARAM NUMBER            # e.g.  gaze.x -0.8  (both eyes)  |  eye.open.l 0
tween      := "tween" INT_MS          # animation duration for the sets that follow
hold       := "hold" INT_MS           # pause, for timed sequences / micro-expressions
state      := "state"                 # request current vector back
done       := "done"                  # the model is satisfied; ends the refine loop
comment    := "#" ...to end of line
PARAM      := CONTROL                  # bare control = symmetric shorthand, sets BOTH sides
            | CONTROL "." SIDE         # one side only, e.g.  brow.angle.r 0.4
CONTROL    := eye.open | eye.pupil | brow.angle | gaze.x | gaze.y
SIDE       := "l" | "r"                # viewer's left / right
```

Semantics:

- A `set` updates a **target**; the simulator tweens the live face from its current value
  toward the target over the active `tween` duration (a sensible default, e.g. `250`, if
  none is given).
- Values are **clamped** to each parameter's range; unknown params or malformed lines are
  reported back as errors rather than silently dropped.
- A bare control name expands to **both** `.l` and `.r`; because sets fold last-write-wins,
  a later per-side set overrides one side (`eye.open 0.5 ; eye.open.l 0` is a wink).
- `hold` + multiple batches let the model **choreograph a sequence** — not just one
  static pose. Sequences are a first-class capability of the v1 DSL.

### The agentic loop

```text
        ┌─────────────────────────────────────────────────────────┐
        │  System prompt: describes the face, the parameter space, │
        │  the DSL grammar, and worked examples.                   │
        └─────────────────────────────────────────────────────────┘
                                   │
   feeling / situation ──▶  ┌────────────┐   DSL program   ┌───────────────┐
   ("embarrassed",          │    LLM     │ ──────────────▶ │  Simulator    │
    "your friend            │  (agent)   │                 │  (SVG face)   │
    surprised you")         └────────────┘ ◀────────────── │  animates +   │
                                   ▲        state report    │  reports)     │
                                   │                        └───────────────┘
                                   └──────── observe & optionally refine ────┘
                                              (human watches live)
```

1. The harness supplies a **target**: a raw feeling (`"melancholy"`) or a situation
   (`"you just spilled coffee on your boss"`).
2. The **system prompt** teaches the model the face, the parameter space, and the DSL.
3. The model emits a **DSL program** — a single pose or a timed sequence.
4. The **simulator** applies it: the SVG face animates in the browser, and the resulting
   **state vector** is returned to the model as text.
5. The model may **observe the reported state and refine**, or declare the expression
   complete. A human watches the live face throughout.

The model's feedback channel is the **numeric state report** (not a screenshot), which
keeps the loop cheap and deterministic. Whether the face *reads* as the intended emotion
is, for now, judged by the human watching.

## What we test with it

A small library of **prompts** in two flavors:

- **Feelings** — single-word or short affect labels: `curious`, `suspicious`, `sleepy`,
  `smug`, `heartbroken`.
- **Situations** — scenarios the model must interpret, then express: *"the surprise party
  worked," "you realize you left the oven on," "someone is lying to you and you know it."*

The interesting outputs are the model's **reasoning** ("narrow the eyes, tilt the brows
down-and-in, glance sideways for suspicion…") paired with the **face that results**.

## Scope

**In scope (v1 / MVP):**

- The **five** core controls above (eyes + brows + gaze), each **per side** (ten
  parameters), rendered as an animated SVG face in the browser, over a static neutral mouth.
- The v1 DSL (`set` / `tween` / `hold` / `state`), including **timed sequences** and the
  per-side / symmetric-shorthand set forms.
- An agentic loop that feeds a feeling/situation, runs the model, and applies its DSL.
- A live browser view for a human to watch, plus textual state reporting to the model.

**Explicitly out of scope (for now):**

- **Mouth control.** The mouth renders static/neutral; no mouth parameters yet.
- **Automated scoring / judging.** No round-trip guessing, no eval metrics — we express
  and observe. (See *Future directions*.)
- **Vision feedback.** The model reasons from the numeric state, not from an image.
- **Head pose/tilt, color/skin, secondary features** (nose, ears, tears).
- **Idle animation, personality persistence across prompts, speech.**

## Future directions

- **Mouth control** — the first expansion. Likely `mouth.curve` (`-1` down-turned → `1`
  up-turned) and `mouth.open` (`0` closed → `1` agape); the latter is what unlocks
  surprise/shock. Kept mechanical, never a `smile` knob. Note: every control is per-side by
  default now, so a mouth would be the first place to ask whether a single shared axis fits
  better than an `.l`/`.r` split.
- **Round-trip validation ("emotional charades").** A second model — blind to the target
  — sees the rendered face and guesses the emotion; agreement becomes a self-scoring,
  repeatable success metric. The natural next step once v1 feels right.
- **Named, reusable gesture sequences** as first-class objects (a library of
  micro-expressions the model can invoke by name).
- **Human vs. model comparison** — do people read the model's faces the way it intended?

## Glossary

- **Control** — one geometric quantity (e.g. `eye.open`); each control exists per side as
  two **parameters**, `.l` and `.r`. There are five controls, ten parameters.
- **Parameter** — one per-side value (e.g. `eye.open.l`); the smallest thing the face stores.
- **Expression / pose** — one assignment of all parameters; a point in the face space.
- **Vector** — the full ordered set of current parameter values (all ten).
- **Tween** — the timed interpolation from the current vector to a target vector.
- **Program** — one block of DSL the model emits in a turn.
- **Sequence** — a program using `hold` to choreograph multiple poses over time.
