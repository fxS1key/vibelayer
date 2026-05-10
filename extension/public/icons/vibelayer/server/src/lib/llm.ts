// Provider-agnostic LLM gateway. The contract:
//   generatePatch(system, user, opts) -> { text, tokensIn, tokensOut, model }
// Internally we route to Anthropic, OpenAI, or a BYOK call. Adding Gemini is a
// single new case in `provider`.

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export interface LlmResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
}

export interface LlmOptions {
  system: string;
  user: string;
  // If provided, route to user's BYOK key instead of platform credentials.
  byok?: { provider: 'anthropic' | 'openai'; apiKey: string };
  model?: string;
  maxTokens?: number;
}

const DEFAULT_MODEL = process.env.DEFAULT_LLM_MODEL ?? 'claude-sonnet-4-6';

export async function callLlm(opts: LlmOptions): Promise<LlmResult> {
  const provider = opts.byok?.provider ?? (opts.model?.startsWith('gpt') ? 'openai' : 'anthropic');
  const model = opts.model ?? DEFAULT_MODEL;

  if (provider === 'anthropic') {
    const client = new Anthropic({
      apiKey: opts.byok?.apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    const resp = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 2048,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return {
      text,
      tokensIn: resp.usage.input_tokens,
      tokensOut: resp.usage.output_tokens,
      model,
    };
  }

  // OpenAI path
  const client = new OpenAI({ apiKey: opts.byok?.apiKey ?? process.env.OPENAI_API_KEY });
  const resp = await client.chat.completions.create({
    model,
    max_tokens: opts.maxTokens ?? 2048,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    response_format: { type: 'json_object' },
  });
  return {
    text: resp.choices[0]?.message.content ?? '',
    tokensIn: resp.usage?.prompt_tokens ?? 0,
    tokensOut: resp.usage?.completion_tokens ?? 0,
    model,
  };
}
