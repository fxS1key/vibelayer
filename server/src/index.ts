// Fastify entrypoint. Plugins register routes; everything else (DB, LLM client)
// is wired here via decorators so tests can swap them out.

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { generateRoutes } from './routes/generate.js';
import { patchesRoutes } from './routes/patches.js';
import { syncRoutes } from './routes/sync.js';
import { billingRoutes } from './routes/billing.js';
import { usageRoutes } from './routes/usage.js';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  bodyLimit: 2 * 1024 * 1024, // DOM snapshots can be chunky
});

await app.register(cors, {
  origin: (process.env.CORS_ORIGINS ?? 'chrome-extension://*').split(','),
  credentials: true,
});
await app.register(jwt, { secret: process.env.JWT_SECRET ?? 'dev-secret-change-me' });
await app.register(rateLimit, { max: 200, timeWindow: '1 minute' });

app.get('/health', async () => ({ ok: true }));

await app.register(generateRoutes, { prefix: '/api/v1' });
await app.register(patchesRoutes, { prefix: '/api/v1' });
await app.register(syncRoutes, { prefix: '/api/v1' });
await app.register(billingRoutes, { prefix: '/api/v1' });
await app.register(usageRoutes, { prefix: '/api/v1' });

const port = Number(process.env.PORT ?? 8080);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
