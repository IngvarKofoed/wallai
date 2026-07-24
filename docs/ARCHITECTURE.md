# ARCHITECTURE — Facial Expression Simulator (`wallai`)

> Companion to [`CONCEPT.md`](./CONCEPT.md). The concept defines *what* and *why*; this
> defines *how*. Read the concept first — especially **"mechanical, not emotional,"**
> which this architecture is built to protect.

## 1. Design goals

1. **Three swappable seams.** The renderer, the LLM provider, and the control format
   (the **Codec**: DSL now, JSON/MCP later) are each pluggable behind a small interface.
   Swapping one must not touch the others.
2. **A stable core.** A tiny set of shared data contracts (the face vector, the animation
   timeline) is the lingua franca between the seams. Everything else is replaceable; these
   contracts change rarely.
3. **The face parameters have one home.** A single `CONTROLS` spec defines every control,
   its range, and its description; the per-side `PARAMS` vector is *derived* from it
   (`CONTROLS × SIDES`). Clamping, validation, and (most of) the prompt text derive from
   `PARAMS`/`CONTROLS` in turn — so adding a control is a near-one-file change.
4. **Single source of truth for state.** One component owns the authoritative face vector
   and answers "what does the face look like now"; the renderer is a visual sink.

## 2. Component map

```text
                 ┌──────────────────────────── SERVER (Node) ────────────────────────────┐
                 │                                                                        │
  human          │   ┌───────────────┐   system prompt = BASE_PROMPT + codec.describe()   │
  feeling/  ────►│   │  Orchestrator │◄──── describe() ─────────┐                          │
  situation      │   │   (the loop)  │───── parse(output) ─────►│   Codec   │              │
  (browser UI)   │   └──┬─────────┬──┘        → Timeline        │  (DSL;    │              │
                 │      │         │                             │ JSON/MCP  │              │
                 │ run()│         │ apply(Timeline)             │  later)   │              │
                 │      ▼         ▼                             └───────────┘              │
                 │  ┌────────┐  ┌───────────┐   play(Timeline)   ┌───────────┐             │
                 │  │  LLM   │  │ FaceState │ ─────────────────► │  Renderer │             │
                 │  │Provider│  │(authorita-│                    │  (sink)   │             │
                 │  └────────┘  │  tive)    │                    └─────┬─────┘             │
                 │              └───────────┘                          │                  │
                 └────────────────────────────────────────────────────┼──────────────────┘
                                                       WebSocket        │ Timeline
                 ┌──────────────────────────── BROWSER ─────────────────▼──────────────────┐
                 │   SVG face (eyes, brows, static mouth) + tween engine + control UI       │
                 └───────────────────────────────────────────────────────────────────────┘
```

## 3. Tech stack (defaults — all swappable)

- **TypeScript, end to end.** The server and the browser share the core data contracts
  (`FaceVector`, `Timeline`), which is the main reason to pick one language for both.
- **Browser: Vite + vanilla TS + inline SVG.** No UI framework needed for one face; the
  renderer is a small module that maps a `FaceVector` to SVG attributes and tweens with
  `requestAnimationFrame`.
- **Server: Node + a WebSocket (`ws`).** Hosts the orchestrator and the provider wiring;
  pushes timelines to the browser and receives run requests.
- **Default LLM: Anthropic via `@anthropic-ai/sdk`.** Default model `claude-sonnet-5` for
  responsiveness in an interactive loop, `claude-opus-4-8` when reasoning quality matters
  more than latency. API keys live **only** on the server, never in the browser.

These are defaults, not commitments — each sits behind a seam interface (§5). **The MVP
ships one codec (`dsl`), one provider (`anthropic`), and one renderer (`svg`);** the seams
exist so the others can be added without disturbing the core.

## 4. Core data contracts

The center of the system. Small, stable, shared by server and browser.

```ts
// params.ts — the ONE home for the parameter space (see CONCEPT "mechanical, not emotional")
// A control is defined ONCE; its two per-side parameters (`.l`/`.r`) are derived from
// CONTROLS × SIDES, so the face can be asymmetric (a wink, a cocked brow) with no per-side
// prose. The bare-control "symmetric shorthand" is a DSL convenience (codecs/dsl.ts), not
// a core concept — this module speaks only per-side ParamNames.
export const CONTROLS = {
  'eye.open':   { min: 0,  max: 1,  describe: 'eyelid aperture: 0 closed → 1 wide open' },
  'eye.pupil':  { min: 0,  max: 1,  describe: 'pupil diameter: 0 constricted → 1 dilated' },
  'brow.angle': { min: -1, max: 1,  describe: 'brow tilt: -1 inner end down → 1 inner end up' },
  'gaze.x':     { min: -1, max: 1,  describe: 'eye horizontal: -1 left → 0 center → 1 right' },
  'gaze.y':     { min: -1, max: 1,  describe: 'eye vertical: -1 down → 0 center → 1 up' },
} as const;

export const SIDES = ['l', 'r'] as const;             // viewer's left / right
export type ControlName = keyof typeof CONTROLS;
export type ParamName = `${ControlName}.${(typeof SIDES)[number]}`;   // e.g. 'eye.open.l'
export const PARAMS = /* derived: CONTROLS × SIDES */ {} as Record<ParamName, /* spec */ unknown>;
export type FaceVector = Record<ParamName, number>;   // a full pose (ten values)
export type PartialVector = Partial<FaceVector>;      // targets touched by one step

// timeline.ts — the format-agnostic animation IR every Codec produces
export interface Step {
  set: PartialVector;   // target values reached during this step
  tweenMs: number;      // time to animate into `set` (default applied if omitted)
  holdMs: number;       // pause after reaching `set` (0 = none)
}
export type Timeline = Step[];   // one pose = [oneStep]; a sequence = many
```

`clamp(vec)` and `validate(name, value)` are derived from `PARAMS` — no per-parameter code
elsewhere.

## 5. The three seams

Each seam is one small interface plus a registry that maps an id → factory, so wiring is
config-driven (§8).

### 5.1 LLM Provider

Abstracts the model. Returns text and/or tool calls, so it serves text formats (DSL, JSON)
and tool-based formats (MCP) alike.

```ts
export interface LlmProvider {
  readonly id: string;                       // 'anthropic' | 'openai' | …
  run(input: {
    system: string;
    messages: Message[];
    tools?: ToolDef[];                       // present only for tool-based codecs
  }): Promise<ModelOutput>;                  // { text?: string; toolCalls?: ToolCall[] }
}
```

Default `AnthropicProvider` wraps the Messages API (and the SDK's tool-use loop when
`tools` is present). Adding a provider = implement the interface + register the id.

### 5.2 Codec — the control-format seam

> **Naming.** We call this the **`Codec`**: it *encodes* its own format into the system
> prompt (`describe()`) and *decodes* the model's output into a `Timeline` (`parse()`). We
> avoided "interpreter" because it wrongly implies execution — the Codec never executes; it
> translates to the `Timeline` IR, and the **renderer** is what plays it.

This is the seam that makes DSL / JSON / MCP interchangeable. It has exactly two jobs:

```ts
export interface Codec {
  readonly id: string;                       // 'dsl' (MVP) | 'json' | 'mcp'

  // (1) ENCODE itself into the system prompt (and contribute tool defs if tool-based).
  describe(): PromptContribution;            // { instructions: string; tools?: ToolDef[] }

  // (2) DECODE model output in its format into the shared Timeline IR.
  parse(output: ModelOutput): ParseResult;   // ok → Timeline; !ok → errors (fed back to model)
}
```

**The key decoupling (your insight):** the orchestrator builds the system prompt as
`BASE_PROMPT + codec.describe().instructions`. So swapping the codec swaps the "how to
command the face" section of the prompt *automatically* — the model is always told how to
speak whichever format is wired in. The BASE prompt (the task, the mechanical principle,
the parameter table) never changes.

Implementations:

| id     | status      | `describe()` contributes                              | `parse()` decodes                 |
| ------ | ----------- | ----------------------------------------------------- | --------------------------------- |
| `dsl`  | **MVP**     | the DSL grammar + worked examples (CONCEPT §3.3)      | text → small hand-written parser  |
| `json` | planned     | a JSON pose/keyframe shape + examples                 | text → `JSON.parse` + `validate`  |
| `mcp`  | next version| `set_expression` / `get_state` **tool defs**          | `output.toolCalls` → Timeline     |

- **MVP builds only the `dsl` codec.** `json` and `mcp` are designed-for (they slot into the
  same interface) but not implemented yet. Keeping the seam now costs almost nothing and
  means adding them later is "write one file + register an id."
- When `mcp` is built, its default backing is **in-process tool-use** via the provider (same
  model-facing behavior as MCP, less infra); a real standalone MCP server is an even-later
  option behind the same id.
- The DSL/JSON `describe()` outputs are **generated from `CONTROLS`** (the model-facing table
  lists the five controls, with per-side `.l`/`.r` addressing explained once), so a new
  control documents itself without editing prose.
- A `parse()` failure (bad syntax, unknown param, out-of-range) returns `errors`, which the
  orchestrator feeds back into the conversation so the model can self-correct — a natural
  agentic retry that dovetails with the refine loop (§7).

### 5.3 Renderer — the visual seam

A pure sink: it plays a `Timeline`. It does **not** own state (FaceState does, §6).

```ts
export interface Renderer {
  readonly id: string;                       // 'svg' | 'canvas' | 'png' | 'ascii'
  play(timeline: Timeline): Promise<void>;   // animate; resolves when the timeline finishes
  reset(): Promise<void>;                    // snap back to the neutral vector
}
```

The default `svg` renderer is **split across the wire**: the server-side implementation
(`RemoteSvgRenderer`) serializes the `Timeline` over the WebSocket; the browser holds the
actual SVG + `requestAnimationFrame` tween engine and animates eyes, brows, and gaze
(mouth is drawn static/neutral). Because the renderer is just "consume a `Timeline`," a
headless `png` renderer or an `ascii` renderer drops in without touching anything else.

## 6. State ownership & tweening

- **`FaceState` (server, authoritative)** holds the current `FaceVector`. On each program
  it *folds* the timeline's `set`s in order (last write wins per param), clamps via
  `PARAMS`, and stores the resulting resting pose. `getState()` answers from here — no
  round-trip to the browser.
- **The browser tweens** for visuals only, using the same interpolation the timeline
  implies. Because a tween is deterministic given (start, target, duration), the two never
  disagree about the resting pose.
- **`state` semantics — settled-only.** A `state` read returns the **pose the face is
  settling into** (the vector after the current program finishes). If a tween is still in
  flight, the read does *not* return the frozen mid-animation value — the model reasons
  about intended poses, not rendered frames. (This is unrelated to sequences: the model can
  still author as many intermediate poses as it likes, because each `Step` is itself a real
  target. Revisit settled-only if/when screenshot-based scoring needs true frame values.)

## 7. The orchestrator (the loop)

Default mode is **multi-turn refine**: the model may iterate — express, read the confirmed
state, adjust — and ends the turn by emitting a `done` signal, bounded by `maxTurns`.

```text
1. system  = BASE_PROMPT + codec.describe().instructions
   tools    = codec.describe().tools               # undefined for text codecs (DSL/JSON)
2. messages = [ user: "<feeling|situation>. Express it with the face." ]
3. for turn in 1..maxTurns (default 4):
     a. output = llm.run({ system, messages, tools })
     b. parsed = codec.parse(output)
     c. if !parsed.ok:
          messages += feedback(parsed.errors)       # let the model fix it, then continue
          continue
     d. faceState.apply(parsed.timeline)            # update authoritative vector
        renderer.play(parsed.timeline)              # animate in the browser
     e. messages += observation(faceState.getState())   # numeric state back to the model
     f. if output signalled `done`: break           # model is satisfied
4. done (by `done` signal or maxTurns).
```

- The **`done` signal** is codec-native: a DSL `done` statement (a `"done": true` field for
  JSON, a `finish` tool for MCP). Reaching `maxTurns` ends the turn regardless.
- The human triggers a run and watches the live face; the transcript (model reasoning +
  emitted program + resulting state) is streamed to the browser panel.

## 8. Configuration & wiring

Each seam has a registry (`id → factory`); a config object (env or a small file) picks the
ids. Swapping providers is a config change, not a code change.

```ts
// wiring.ts
const config = {
  llm:      env('LLM',      'anthropic'),   // + model, from env
  codec:    env('CODEC',    'dsl'),         // 'dsl' (MVP) | 'json' | 'mcp' (later)
  renderer: env('RENDERER', 'svg'),
};
const llm      = LLM_REGISTRY[config.llm]();
const codec    = CODEC_REGISTRY[config.codec]();
const renderer = RENDERER_REGISTRY[config.renderer]();
const orchestrator = new Orchestrator({ llm, codec, renderer, faceState });
```

## 9. Directory layout

```text
docs/                     CONCEPT.md, ARCHITECTURE.md, CHANGELOG.md
src/
  core/                   the stable center — depended on by everything
    params.ts             CONTROLS spec → per-side PARAMS + clamp/validate (the ONE parameter home)
    timeline.ts           Step / Timeline types
    faceState.ts          authoritative vector + fold/apply
    prompt.ts             BASE_PROMPT (task + mechanical principle + param table)
    orchestrator.ts       the loop (§7)
  llm/
    provider.ts           LlmProvider interface + registry
    anthropic.ts          default provider
  codecs/
    codec.ts              Codec interface + registry
    dsl.ts                the only codec built for MVP
    (json.ts, mcp.ts      planned — same interface, not yet implemented)
  render/
    renderer.ts           Renderer interface + registry
    remoteSvg.ts          server-side sink → WebSocket
  server/
    index.ts              WS server + wiring (§8)
  web/                    browser app (imports core/ types)
    index.html  face.ts   (SVG + rAF tween)  panel.ts  ws.ts
```

`web/` and `server/` both import from `core/`; the contracts are shared, the seams are not.

## 10. Extensibility (worked cases)

- **Add the mouth later.** Add `mouth.curve` (and `mouth.open`) to `CONTROLS`; draw them in
  `web/face.ts`. The per-side `PARAMS`, clamping, the prompt table, and the DSL codec's
  `describe()` all pick them up automatically. No orchestrator or loop changes. (If a mouth
  control should *not* be per-side, that's the point where the single-axis SIDES assumption
  would need revisiting — today every control is split.)
- **Add the JSON or MCP codec.** Implement `Codec`, register the id, set `CODEC=…`. The
  prompt's command section (and, for MCP, the provider's `tools`) swap together via
  `describe()`; nothing else moves.
- **Swap the model to OpenAI.** Implement `LlmProvider`, register `'openai'`, set the env.
- **Headless batch runs.** Register a `png` renderer that rasterizes each timeline; reuse
  the entire orchestrator. (This is also the hook for future round-trip scoring.)

## 11. Decisions & open questions

**Decided:**

- **Codec naming** — `Codec` (encode = `describe`, decode = `parse`).
- **Loop mode** — multi-turn refine by default; model ends with a `done` signal, capped by
  `maxTurns` (default 4).
- **`state` mid-tween** — settled-only (return the pose being settled into, not a frozen
  frame).
- **State ownership** — `FaceState` on the server is authoritative; the browser tweens for
  visuals only.
- **Codec scope for MVP** — `dsl` only. `json` and `mcp` are designed-for behind the seam
  but deferred; `mcp` is a next-version item and will use in-process tool-use first.

**Still open:**

- **Transport** — WebSocket (chosen) vs. SSE + POST, if we ever want a stateless server.
- **`maxTurns` default** — 4 is a guess; tune once we watch real runs.
