// GET /api/v1/usage — list recent generation events for the dashboard.

import type { FastifyInstance } from 'fastify';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';

export async function usageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/usage', { preHandler: requireAuth }, async (req) => {
    void (req as AuthedRequest).userId;
    // TODO: select from token_ledger limit 100
    return { entries: [], balance: 0 };
  });
}
