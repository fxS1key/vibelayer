// Drizzle ORM client. One connection pool, shared.

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  // eslint-disable-next-line no-console
  console.warn('DATABASE_URL not set; DB calls will fail. Set it in .env');
}

const client = postgres(url ?? 'postgres://localhost/vibelayer', { max: 10 });
export const db = drizzle(client);
