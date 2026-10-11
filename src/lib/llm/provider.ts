export interface LLMCompleteRequest {
  system: string;
  user: string;
  /** JSON Schema the model output must conform to. */
  jsonSchema: Record<string, unknown>;
  maxTokens?: number;
  /** Model ID for this call; providers fall back to their default when unset. */
  model?: string;
}

/** Provider-agnostic interface: returns parsed (but not yet validated) JSON. */
export interface LLMProvider {
  complete(req: LLMCompleteRequest): Promise<unknown>;
}

/** Wraps a provider so every request uses `model` unless the request already sets one. */
export function withModel(provider: LLMProvider, model: string): LLMProvider {
  return { complete: (req) => provider.complete({ ...req, model: req.model ?? model }) };
}
