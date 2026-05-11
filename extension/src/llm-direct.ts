// Direct LLM calls for true BYOK — bypasses the VibeLayer server entirely.
// When the user has a BYOK key configured, we call Anthropic / OpenAI from the
// extension itself. This is the only way to honor the "your key, your data"
// promise: with a server proxy, VibeLayer would see every key and prompt.
//
// The server path is kept for the no-BYOK (managed) tier only.

import type { GeneratedPatch } from '@vibelayer/shared';
import { GENERATE_PATCH_SYSTEM_PROMPT, buildGenerateUserMessage } from './prompts/generate-patch.js';

export interface DirectLlmArgs {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  model: string;
  prompt: string;
  domain: string;
  url: string;
  html: string;
  maxTokens?: number;
}

export interface DirectLlmResult {
  patch: GeneratedPatch;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

// Rough public per-1K pricing. Used only for client-side spend estimates; the
// authoritative cost lives on each provider's bill.
const PRICE_PER_1K: Record<string, { in: number; out: number }> = {
  'claude-opus-4-7': { in: 0.015, out: 0.075 },
  'claude-sonnet-4-6': { in: 0.003, out: 0.015 },
  'claude-haiku-4-5-20251001': { in: 0.001, out: 0.005 },
  'gpt-4o': { in: 0.0025, out: 0.01 },
  'gpt-4o-mini': { in: 0.00015, out: 0.0006 },
};

function priceUsd(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICE_PER_1K[model] ?? { in: 0.003, out: 0.015 };
  return (tokensIn / 1000) * p.in + (tokensOut / 1000) * p.out;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Models occasionally wrap output in ```json fences despite instructions.
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence?.[1]) return JSON.parse(fence[1]);
    const brace = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (brace >= 0 && end > brace) return JSON.parse(trimmed.slice(brace, end + 1));
    throw new Error('LLM did not return JSON');
  }
}

// Settings.model is a single dropdown shared by both providers; ensure the
// chosen model matches the BYOK provider, otherwise the provider will 400.
function modelFor(provider: 'anthropic' | 'openai', selected: string): string {
  if (provider === 'anthropic') {
    return selected.startsWith('claude-') ? selected : 'claude-sonnet-4-6';
  }
  return selected.startsWith('gpt-') ? selected : 'gpt-4o-mini';
}

export async function callLlmDirect(args: DirectLlmArgs): Promise<DirectLlmResult> {
  const system = GENERATE_PATCH_SYSTEM_PROMPT;
  const user = buildGenerateUserMessage({
    prompt: args.prompt,
    domain: args.domain,
    url: args.url,
    html: args.html,
  });
  const model = modelFor(args.provider, args.model);

  if (args.provider === 'anthropic') {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': args.apiKey,
        'anthropic-version': '2023-06-01',
        // Allows browser-origin requests; without this Anthropic rejects fetch
        // from extension contexts on some plans.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: args.maxTokens ?? 2048,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Anthropic ${resp.status}: ${body.slice(0, 300)}`);
    }
    const data = (await resp.json()) as {
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };
    const text = data.content
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('');
    const patch = extractJson(text) as GeneratedPatch;
    return {
      patch,
      tokensIn: data.usage.input_tokens,
      tokensOut: data.usage.output_tokens,
      costUsd: priceUsd(model, data.usage.input_tokens, data.usage.output_tokens),
    };
  }

  // OpenAI
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: args.maxTokens ?? 2048,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`OpenAI ${resp.status}: ${body.slice(0, 300)}`);
  }
  const data = (await resp.json()) as {
    choices: Array<{ message: { content: string | null } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  };
  const text = data.choices[0]?.message.content ?? '';
  const patch = extractJson(text) as GeneratedPatch;
  return {
    patch,
    tokensIn: data.usage.prompt_tokens,
    tokensOut: data.usage.completion_tokens,
    costUsd: priceUsd(model, data.usage.prompt_tokens, data.usage.completion_tokens),
  };
}
