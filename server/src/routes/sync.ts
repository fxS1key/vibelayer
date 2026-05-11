// POST /api/v1/sync — accept dirty patches, merge by vector clock.
// GET  /api/v1/sync/events — Server-Sent Events stream of remote updates.
//
// Merge policy:
//   - remote (server) clock dominates → reject the push for that patch and
//     broadcast the server's copy back to the device, which will overwrite
//     local state.
//   - local (incoming) dominates → accept and persist; broadcast to other
//     devices on this user.
//   - neither dominates and content differs → mark the row conflicted, persist
//     the incoming as the new winning version but include the previous server
//     content as `conflictedRemote` so the client can prompt the user.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { and, eq } from 'drizzle-orm';
import {
  SyncPushSchema,
  resolveClocks,
  type VectorClock,
} from '@vibelayer/shared';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { patches } from '../db/schema.js';

// Per-user SSE clients. In production, replace with Redis pub/sub so multiple
// server instances can broadcast to each other.
const clients = new Map<string, Set<FastifyReply>>();

function broadcast(userId: string, event: unknown): void {
  const set = clients.get(userId);
  if (!set) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const reply of set) reply.raw.write(payload);
}

export async function syncRoutes(app: FastifyInstance): Promise<void> {
  app.post('/sync', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = SyncPushSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = (req as AuthedRequest).userId;

    const results: Array<{ id: string; outcome: 'accepted' | 'rejected' | 'conflict' }> = [];

    for (const incoming of parsed.data.patches) {
      const [existing] = await db
        .select()
        .from(patches)
        .where(and(eq(patches.id, incoming.id), eq(patches.userId, userId)))
        .limit(1);

      const remoteClock = (existing?.vectorClock as VectorClock | null) ?? {};
      const localClock = incoming.vectorClock;
      const outcome = existing ? resolveClocks(localClock, remoteClock) : 'local';

      if (outcome === 'remote') {
        // Server is newer — send the server copy back so the device converges.
        broadcast(userId, { type: 'patch.updated', patch: existing });
        results.push({ id: incoming.id, outcome: 'rejected' });
        continue;
      }

      const conflictedRemote =
        outcome === 'conflict' && existing
          ? { css: existing.css, js: existing.js, updatedAt: existing.updatedAt.toISOString() }
          : undefined;

      const payload = {
        id: incoming.id,
        userId,
        domain: incoming.domain,
        name: incoming.name,
        description: incoming.description,
        css: incoming.css,
        js: incoming.js,
        affectedSelectors: incoming.affectedSelectors,
        enabled: incoming.enabled,
        version: incoming.version,
        vectorClock: localClock,
        isDeleted: incoming.isDeleted,
        createdAt: new Date(incoming.createdAt),
        updatedAt: new Date(incoming.updatedAt),
      };

      await db
        .insert(patches)
        .values(payload)
        .onConflictDoUpdate({
          target: patches.id,
          set: {
            domain: payload.domain,
            name: payload.name,
            description: payload.description,
            css: payload.css,
            js: payload.js,
            affectedSelectors: payload.affectedSelectors,
            enabled: payload.enabled,
            version: payload.version,
            vectorClock: payload.vectorClock,
            isDeleted: payload.isDeleted,
            updatedAt: payload.updatedAt,
          },
        });

      const broadcastPatch = { ...incoming, ...(conflictedRemote ? { conflictedRemote } : {}) };
      broadcast(userId, { type: 'patch.updated', patch: broadcastPatch });
      results.push({ id: incoming.id, outcome: conflictedRemote ? 'conflict' : 'accepted' });
    }

    return reply.send({ ok: true, results });
  });

  app.get('/sync/events', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req as AuthedRequest).userId;
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    const set = clients.get(userId) ?? new Set();
    set.add(reply);
    clients.set(userId, set);

    req.raw.on('close', () => {
      set.delete(reply);
      if (set.size === 0) clients.delete(userId);
    });

    // Keepalive every 25s so proxies don't kill the connection.
    const keepalive = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
    req.raw.on('close', () => clearInterval(keepalive));
  });
}
