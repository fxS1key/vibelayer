// CRUD over /api/v1/patches. Thin layer; everything interesting lives in
// schema and the sync route.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PatchSchema } from '@vibelayer/shared';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';

const IdParam = z.object({ id: z.string().uuid() });

export async function patchesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/patches', { preHandler: requireAuth }, async (req) => {
    void (req as AuthedRequest).userId;
    // TODO: select * from patches where user_id = $1 and is_deleted = false
    return { patches: [] };
  });

  app.post('/patches', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = PatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    // TODO: insert
    return reply.code(201).send({ patch: parsed.data });
  });

  app.patch('/patches/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'bad_id' });
    // TODO: update with vector clock merge
    return reply.send({ ok: true });
  });

  app.delete('/patches/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'bad_id' });
    // TODO: tombstone, propagate via SSE
    return reply.send({ ok: true });
  });
}
