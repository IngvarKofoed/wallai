// provider.ts — the LLM Provider seam. Abstracts the model behind a small interface
// so text codecs (DSL/JSON) and tool-based codecs (MCP) are served alike.

import type { ChatMessage, ModelOutput, ToolDef } from '../core/llm-types'

export interface LlmRunInput {
  system: string
  messages: ChatMessage[]
  /** Present only for tool-based codecs. */
  tools?: ToolDef[]
}

export interface LlmProvider {
  readonly id: string
  run(input: LlmRunInput): Promise<ModelOutput>
}
