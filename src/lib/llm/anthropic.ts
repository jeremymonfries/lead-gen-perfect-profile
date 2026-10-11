import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { LLMCompleteRequest, LLMProvider } from './provider';

export const DEFAULT_MODEL = 'claude-opus-5-5';

export class AnthropicProvider implements LLMProvider {
  async complete(req: LLMCompleteRequest): Promise<unknown> {
    // Read env lazily so importing this module never requires a key.
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    const model = req.model ?? (process.env.ANTHROPIC_MODEL || DEFAULT_MODEL);
    const client = new Anthropic({ apiKey });

    const res = await client.messages.create({
      model,
      max_tokens: req.maxTokens ?? 2000,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: req.jsonSchema },
      },
    });

    req.onUsage?.({
      model: res.model ?? model,
      input_tokens: res.usage?.input_tokens ?? 0,
      output_tokens: res.usage?.output_tokens ?? 0,
      cache_read_input_tokens: res.usage?.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: res.usage?.cache_creation_input_tokens ?? 0,
    });

    if (res.stop_reason === 'refusal') throw new Error('Model declined the request');
    if (res.stop_reason === 'max_tokens') throw new Error('Model output was truncated (max_tokens)');
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Model returned non-JSON output');
    }
  }
}

let cached: LLMProvider | null = null;
export function getDefaultProvider(): LLMProvider {
  return (cached ??= new AnthropicProvider());
}
