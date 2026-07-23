// anthropic.ts — default LlmProvider implementation, wrapping the Anthropic Messages API.
// See ARCHITECTURE.md §5.1. Mechanical only: no emotion vocabulary belongs here — this
// file only moves system/messages/tools text and tool-call data, it never interprets it.

import Anthropic from '@anthropic-ai/sdk'
import type { LlmProvider, LlmRunInput } from './provider'
import type { ModelOutput, ToolCall } from '../core/llm-types'

export interface AnthropicProviderOptions {
  apiKey?: string
  model?: string
  maxTokens?: number
}

export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic'

  private readonly apiKey: string | undefined
  private readonly model: string
  private readonly maxTokens: number
  private client: Anthropic | undefined

  constructor(options: AnthropicProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY
    this.model = options.model ?? process.env.WALLAI_MODEL ?? 'claude-sonnet-5'
    this.maxTokens = options.maxTokens ?? 2048
  }

  async run(input: LlmRunInput): Promise<ModelOutput> {
    if (!this.apiKey) {
      throw new Error(
        'AnthropicProvider: no API key configured. Set ANTHROPIC_API_KEY (or pass apiKey to the constructor).',
      )
    }

    // Build the SDK client once and reuse it across turns/runs so the HTTP
    // connection pool (keep-alive) survives instead of being rebuilt per call.
    this.client ??= new Anthropic({ apiKey: this.apiKey })
    const client = this.client

    const resp = await client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      // The system prompt is large and byte-stable across every turn and run, so mark it
      // cacheable — repeated turns hit the prompt cache instead of re-paying for the prefix.
      system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
      messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
      tools:
        input.tools && input.tools.length
          ? (input.tools as unknown as Anthropic.Tool[])
          : undefined,
    })

    const textParts: string[] = []
    const toolCalls: ToolCall[] = []

    for (const block of resp.content) {
      if (block.type === 'text') {
        textParts.push(block.text)
      } else if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, input: block.input })
      }
    }

    const output: ModelOutput = { text: textParts.join('') }
    if (toolCalls.length) {
      output.toolCalls = toolCalls
    }
    return output
  }
}
