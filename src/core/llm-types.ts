// llm-types.ts — shared LLM-facing types. Imported by llm/, codecs/, and core/prompt.ts.
// Kept provider-agnostic so any LlmProvider and any Codec speak the same shapes.

export interface ToolDef {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  input: unknown
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ModelOutput {
  text?: string
  toolCalls?: ToolCall[]
}

export interface PromptContribution {
  instructions: string
  tools?: ToolDef[]
}
