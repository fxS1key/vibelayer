// CRUD over /api/v1/patches.
//
// Vector-clock merge lives in the sync route; this file does plain CRUD scoped
// to the authenticated user. Soft delete is the only delete: we tombstone via
// is_deleted so the deletion propagates through sync.

import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { PatchSchema } from '@vibelayer/shared';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { patches } from '../db/schema.js';

const IdParam = z.object({ id: z.string().uuid() });
const UpdateBody = PatchSchema.partial().omit({ id: true, userId: true, createdAt: true });

export async function patchesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/patches', { preHandler: requireAuth }, async (req) => {
    const userId = (req as AuthedRequest).userId;
    const rows = await db
      .select()
      .from(patches)
      .where(and(eq(patches.userId, userId), eq(patches.isDeleted, false)));
    return { patches: rows };
  });

  app.post('/patches', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = PatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = (req as AuthedRequest).userId;

    const [row] = await db
      .insert(patches)
      .values({
        id: parsed.data.id,
        userId,
        domain: parsed.data.domain,
        name: parsed.data.name,
        description: parsed.data.description,
        css: parsed.data.css,
        js: parsed.data.js,
        affectedSelectors: parsed.data.affectedSelectors,
        enabled: parsed.data.enabled,
        version: parsed.data.version,
        isDeleted: parsed.data.isDeleted,
        createdAt: new Date(parsed.data.createdAt),
        updatedAt: new Date(parsed.data.updatedAt),
      })
      .onConflictDoNothing({ target: patches.id })
      .returning();

    return reply.code(201).send({ patch: row });
  });

  app.patch('/patches/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'bad_id' });
    const body = UpdateBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    const userId = (req as AuthedRequest).userId;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ['domain', 'name', 'description', 'css', 'js', 'enabled', 'version'] as const) {
      if (body.data[k] !== undefined) updates[k] = body.data[k];
    }
    if (body.data.affectedSelectors !== undefined) updates.affectedSelectors = body.data.affectedSelectors;

    const [row] = await db
      .update(patches)
      .set(updates)
      .where(and(eq(patches.id, p.data.id), eq(patches.userId, userId)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return reply.send({ patch: row });
  });

  app.delete('/patches/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'bad_id' });
    const userId = (req as AuthedRequest).userId;

    const [row] = await db
      .update(patches)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(patches.id, p.data.id), eq(patches.userId, userId)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return reply.send({ ok: true });
  });
}
