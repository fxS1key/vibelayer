// POST /api/v1/generate — the main money path.
//
// Flow:
//   1. Validate input (Zod).
//   2. Check auth + token balance (unless BYOK).
//   3. Call LLM with system prompt + sanitized snapshot.
//   4. Parse JSON output, fail loudly if malformed.
//   5. Static safety check; on fail return 422 with reasons.
//   6. Charge tokens (or skip for BYOK), persist usage, return patch.

import type { FastifyInstance } from 'fastify';
import { GenerateRequestSchema, GeneratedPatchSchema } from '@vibelayer/shared';
import {
  GENERATE_PATCH_SYSTEM_PROMPT,
  buildGenerateUserMessage,
} from '../prompts/generate-patch.js';
import { callLlm } from '../lib/llm.js';
import { staticCheck } from '../lib/sandbox-check.js';
import { signPatch } from '../lib/signing.js';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';

export async function generateRoutes(app: FastifyInstance): Promise<void> {
  app.post('/generate', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = GenerateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const { prompt, snapshot, byokKey, byokProvider, model } = parsed.data;
    const userId = (req as AuthedRequest).userId;

    const llm = await callLlm({
      system: GENERATE_PATCH_SYSTEM_PROMPT,
      user: buildGenerateUserMessage({
        prompt,
        domain: snapshot.domain,
        url: snapshot.url,
        html: snapshot.html,
      }),
      ...(byokKey && byokProvider ? { byok: { provider: byokProvider, apiKey: byokKey } } : {}),
      ...(model ? { model } : {}),
    });

    let patch;
    try {
      patch = GeneratedPatchSchema.parse(JSON.parse(llm.text));
    } catch (e) {
      req.log.warn({ err: e, raw: llm.text.slice(0, 200) }, 'model returned malformed JSON');
      return reply.code(502).send({ error: 'model_output_malformed' });
    }

    const safety = staticCheck(patch);
    if (!safety.safe) {
      return reply.code(422).send({ error: 'unsafe_patch', reasons: safety.reasons });
    }

    const totalTokens = llm.tokensIn + llm.tokensOut;
    const markup = Number(process.env.TOKEN_MARKUP ?? '3.0');
    const costUsd = (totalTokens / 1000) * 0.003 * markup;

    // TODO: deduct from token_ledger here (skipped for BYOK). Insert usage row.
    void userId;

    const signed = signPatch(patch);

    return reply.send({
      patch: signed.patch,
      signature: signed.signature,
      tokensUsed: totalTokens,
      costUsd,
      model: llm.model,
      cached: false,
    });
  });
}
