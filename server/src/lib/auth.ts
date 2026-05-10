// Auth helper. Decorate the request with userId from the JWT, or 401.

import type { FastifyReply, FastifyRequest } from 'fastify';

export interface AuthedRequest extends FastifyRequest {
  userId: string;
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const decoded = await req.jwtVerify<{ sub: string }>();
    (req as AuthedRequest).userId = decoded.sub;
  } catch {
    reply.code(401).send({ error: 'unauthorized' });
  }
}
