// wiring.ts — config-driven assembly of the three seams (ARCHITECTURE §8). Each seam has
// a literal id → factory map; env vars pick the ids (CODEC, LLM, RENDERER), defaulting to
// the MVP trio (dsl / anthropic / svg). Swapping a provider is a config change, not code.

import { Orchestrator } from '../core/orchestrator'
import { FaceState } from '../core/faceState'
import { DslCodec } from '../codecs/dsl'
import { AnthropicProvider } from '../llm/anthropic'
import { RemoteSvgRenderer } from '../render/remoteSvg'

import type { Codec } from '../codecs/codec'
import type { LlmProvider } from '../llm/provider'
import type { Renderer } from '../render/renderer'
import type { ServerMessage } from '../core/protocol'

const codecs: Record<string, () => Codec> = {
  dsl: () => new DslCodec(),
}

const providers: Record<string, () => LlmProvider> = {
  anthropic: () => new AnthropicProvider({}),
}

const renderers: Record<string, (broadcast: (msg: ServerMessage) => void) => Renderer> = {
  svg: (broadcast) => new RemoteSvgRenderer(broadcast),
}

/** What the server needs from a wired-up system: the loop, the authoritative state, and
 *  the renderer (so the server can trigger a reset before each run). */
export interface WiredSystem {
  orchestrator: Orchestrator
  faceState: FaceState
  renderer: Renderer
}

function pick<T>(map: Record<string, () => T>, id: string, kind: string): () => T {
  const factory = map[id]
  if (!factory) {
    throw new Error(
      `unknown ${kind} "${id}"; available: ${Object.keys(map).join(', ')}`,
    )
  }
  return factory
}

export function buildOrchestrator(
  broadcast: (msg: ServerMessage) => void,
): WiredSystem {
  const codecId = process.env.CODEC ?? 'dsl'
  const llmId = process.env.LLM ?? 'anthropic'
  const rendererId = process.env.RENDERER ?? 'svg'

  const faceState = new FaceState()
  const codec = pick(codecs, codecId, 'codec')()
  const llm = pick(providers, llmId, 'llm provider')()

  const rendererFactory = renderers[rendererId]
  if (!rendererFactory) {
    throw new Error(
      `unknown renderer "${rendererId}"; available: ${Object.keys(renderers).join(', ')}`,
    )
  }
  const renderer = rendererFactory(broadcast)

  const orchestrator = new Orchestrator({ llm, codec, renderer, faceState })
  return { orchestrator, faceState, renderer }
}
