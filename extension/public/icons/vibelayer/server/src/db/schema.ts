// Drizzle schema mirroring db/schema.sql.
// Source of truth for migrations is the SQL file (loaded by docker-compose);
// this file gives us typed query construction in route handlers.

import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  timestamp,
  jsonb,
  bigserial,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique(),
  oauthGoogle: text('oauth_google').unique(),
  oauthGithub: text('oauth_github').unique(),
  tier: text('tier').notNull().default('free'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const patches = pgTable(
  'patches',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    domain: text('domain').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    css: text('css').notNull().default(''),
    js: text('js').notNull().default(''),
    affectedSelectors: text('affected_selectors').array().notNull().default([]),
    enabled: boolean('enabled').notNull().default(true),
    vectorClock: jsonb('vector_clock').notNull().default({}),
    version: integer('version').notNull().default(0),
    isDeleted: boolean('is_deleted').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userDomainIdx: index('patches_user_domain_idx').on(t.userId, t.domain) }),
);

export const patchVersions = pgTable(
  'patch_versions',
  {
    patchId: uuid('patch_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    diff: jsonb('diff').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.patchId, t.versionNumber] }) }),
);

export const syncStates = pgTable(
  'sync_states',
  {
    userId: uuid('user_id').notNull(),
    deviceId: uuid('device_id').notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
    vectorClock: jsonb('vector_clock').notNull().default({}),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.deviceId] }) }),
);

export const deviceRegistry = pgTable(
  'device_registry',
  {
    userId: uuid('user_id').notNull(),
    deviceId: uuid('device_id').notNull(),
    browser: text('browser'),
    os: text('os'),
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.deviceId] }) }),
);

export const tokenLedger = pgTable(
  'token_ledger',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    delta: integer('delta').notNull(),
    reason: text('reason').notNull(),
    ref: text('ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index('token_ledger_user_idx').on(t.userId, t.createdAt) }),
);

export const presets = pgTable(
  'presets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id').notNull(),
    sourcePatchId: uuid('source_patch_id'),
    domain: text('domain').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    tags: text('tags').array().notNull().default([]),
    css: text('css').notNull().default(''),
    js: text('js').notNull().default(''),
    status: text('status').notNull().default('pending'),
    installs: bigint('installs', { mode: 'number' }).notNull().default(0),
    upvotes: bigint('upvotes', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ domainIdx: index('presets_domain_idx').on(t.domain) }),
);

export const presetInstalls = pgTable(
  'preset_installs',
  {
    userId: uuid('user_id').notNull(),
    presetId: uuid('preset_id').notNull(),
    installedAt: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.presetId] }) }),
);
