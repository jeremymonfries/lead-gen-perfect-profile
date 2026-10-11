export interface LLMUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface LLMCompleteRequest {
  system: string;
  user: string;
  /** JSON Schema the model output must conform to. */
  jsonSchema: Record<string, unknown>;
  maxTokens?: number;
  /** Model ID for this call; providers fall back to their default when unset. */
  model?: string;
  /** Called with token counts after each API response (including failed/truncated ones). */
  onUsage?: (u: LLMUsage) => void;
}

/** Provider-agnostic interface: returns parsed (but not yet validated) JSON. */
export interface LLMProvider {
  complete(req: LLMCompleteRequest): Promise<unknown>;
}

/** Wraps a provider so every request uses `model` unless the request already sets one. */
export function withModel(provider: LLMProvider, model: string): LLMProvider {
  return { complete: (req) => provider.complete({ ...req, model: req.model ?? model }) };
}

/** Wraps a provider so every call's token usage is sent to `sink` (chains with any existing onUsage). */
export function withUsage(provider: LLMProvider, sink: (u: LLMUsage) => void): LLMProvider {
  return {
    complete: (req) => provider.complete({
      ...req,
      onUsage: (u) => { req.onUsage?.(u); sink(u); },
    }),
  };
}
