// POST /api/v1/sync — accept dirty patches, merge by vector clock.
// GET  /api/v1/sync/events — Server-Sent Events stream of remote updates.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { SyncPushSchema } from '@vibelayer/shared';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';

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

    for (const patch of parsed.data.patches) {
      // TODO: load server-side patch, compare vector clocks, decide local/remote/conflict.
      broadcast(userId, { type: 'patch.updated', patch });
    }
    return reply.send({ ok: true });
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
