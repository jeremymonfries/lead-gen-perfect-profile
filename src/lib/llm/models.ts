import type { LLMUsage } from './provider';

// Prices in US$ per million tokens, as of 11 Oct 2026. Haiku has higher rates above
// 100K-token prompts (not reached here).
export const LLM_MODELS = [
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5 — cheapest (US$0.10 / $0.50 per M tokens)', price: { input: 0.1, output: 0.5 } },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 — balanced (US$2 / $10)', price: { input: 2, output: 10 } },
  { id: 'claude-opus-5-5', label: 'Opus 5.5 — best quality (US$4 / $20)', price: { input: 4, output: 20 } },
] as const;

/** US$10 per 1,000 web searches. */
export const WEB_SEARCH_USD = 0.01;

export type LlmModelId = (typeof LLM_MODELS)[number]['id'];

export function isLlmModel(x: unknown): x is LlmModelId {
  return typeof x === 'string' && LLM_MODELS.some((m) => m.id === x);
}

/** Cost in US$ of one call. Unknown models are priced as Opus (conservative). */
export function costUsd(u: LLMUsage): number {
  const price = (LLM_MODELS.find((m) => m.id === u.model) ?? LLM_MODELS[2]).price;
  return (
    u.input_tokens * price.input +
    u.cache_creation_input_tokens * price.input * 1.25 +
    u.cache_read_input_tokens * price.input * 0.1 +
    u.output_tokens * price.output
  ) / 1e6 + (u.web_search_requests ?? 0) * WEB_SEARCH_USD;
}
