-- VibeLayer PostgreSQL schema.
-- Loaded automatically by docker-compose on first boot (see docker-compose.yml).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- users ----------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT UNIQUE,
  oauth_google  TEXT UNIQUE,
  oauth_github  TEXT UNIQUE,
  tier          TEXT NOT NULL DEFAULT 'free',   -- free | starter | pro | developer | enterprise
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- patches ----------
CREATE TABLE IF NOT EXISTS patches (
  id                  UUID PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain              TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  css                 TEXT NOT NULL DEFAULT '',
  js                  TEXT NOT NULL DEFAULT '',
  affected_selectors  TEXT[] NOT NULL DEFAULT '{}',
  enabled             BOOLEAN NOT NULL DEFAULT true,
  ciphertext          BYTEA,                  -- when client-side encryption is on
  vector_clock        JSONB NOT NULL DEFAULT '{}'::jsonb,
  version             INT NOT NULL DEFAULT 0,
  is_deleted          BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patches_user_domain_idx ON patches(user_id, domain);

-- ---------- patch_versions ----------
-- 90-day history (Pro tier). We keep diffs, not full snapshots, to bound storage.
CREATE TABLE IF NOT EXISTS patch_versions (
  patch_id        UUID NOT NULL REFERENCES patches(id) ON DELETE CASCADE,
  version_number  INT NOT NULL,
  diff            JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (patch_id, version_number)
);

-- ---------- sync_states ----------
CREATE TABLE IF NOT EXISTS sync_states (
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id        UUID NOT NULL,
  last_synced_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  vector_clock     JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, device_id)
);

-- ---------- device_registry ----------
CREATE TABLE IF NOT EXISTS device_registry (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   UUID NOT NULL,
  browser     TEXT,
  os          TEXT,
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);

-- ---------- token_ledger ----------
-- Append-only ledger; current balance is SUM(delta). One row per generation
-- (negative delta) or top-up (positive delta).
CREATE TABLE IF NOT EXISTS token_ledger (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta       INT NOT NULL,
  reason      TEXT NOT NULL,           -- 'topup' | 'generate' | 'royalty' | 'refund'
  ref         TEXT,                    -- patch_id, stripe_session_id, etc.
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS token_ledger_user_idx ON token_ledger(user_id, created_at DESC);

-- ---------- presets ----------
CREATE TABLE IF NOT EXISTS presets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id       UUID NOT NULL REFERENCES users(id),
  source_patch_id UUID REFERENCES patches(id) ON DELETE SET NULL,
  domain          TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  tags            TEXT[] NOT NULL DEFAULT '{}',
  css             TEXT NOT NULL DEFAULT '',
  js              TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  installs        BIGINT NOT NULL DEFAULT 0,
  upvotes         BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS presets_domain_idx ON presets(domain);

-- ---------- preset_installs ----------
CREATE TABLE IF NOT EXISTS preset_installs (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preset_id   UUID NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, preset_id)
);

CREATE EXTENSION IF NOT EXISTS "citext";
