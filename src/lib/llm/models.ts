export const LLM_MODELS = [
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5 — cheapest (US$0.10 / $0.50 per M tokens)' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 — balanced (US$2 / $10)' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5 — best quality (US$4 / $20)' },
] as const;

export type LlmModelId = (typeof LLM_MODELS)[number]['id'];

export function isLlmModel(x: unknown): x is LlmModelId {
  return typeof x === 'string' && LLM_MODELS.some((m) => m.id === x);
}
