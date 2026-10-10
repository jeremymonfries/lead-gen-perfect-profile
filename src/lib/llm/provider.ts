export interface LLMCompleteRequest {
  system: string;
  user: string;
  /** JSON Schema the model output must conform to. */
  jsonSchema: Record<string, unknown>;
  maxTokens?: number;
}

/** Provider-agnostic interface: returns parsed (but not yet validated) JSON. */
export interface LLMProvider {
  complete(req: LLMCompleteRequest): Promise<unknown>;
}
