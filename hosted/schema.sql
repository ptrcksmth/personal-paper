-- PersonalPaper hosted environment: schema
-- Cloudflare D1 (SQLite). Applied with: npx wrangler d1 execute personal-paper --file hosted/schema.sql
--
-- Six tables, per PRD section 8.2. `owner` and `visibility` exist from day one so that
-- private rows in v2.2 need no migration; v2.1 never writes a private row.

CREATE TABLE IF NOT EXISTS profiles (
  id               TEXT PRIMARY KEY,            -- slug, e.g. global-us-news
  name             TEXT NOT NULL,
  visibility       TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  owner            TEXT,                        -- unused in v2.1
  maintainer       TEXT,                        -- display name of who maintains the definition
  description      TEXT NOT NULL,
  current_version  INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS profile_versions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id   TEXT NOT NULL REFERENCES profiles(id),
  version      INTEGER NOT NULL,
  definition   TEXT NOT NULL,                   -- full definition, JSON
  note         TEXT,                            -- why this version exists
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (profile_id, version)
);

CREATE TABLE IF NOT EXISTS runs (
  id               TEXT PRIMARY KEY,            -- agent-chosen, e.g. 2026-10-18T06-global-us-news
  profile_id       TEXT NOT NULL REFERENCES profiles(id),
  profile_version  INTEGER NOT NULL,
  started_at       TEXT NOT NULL,
  ended_at         TEXT,
  status           TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'degraded', 'failed')),
  log              TEXT,                        -- run log, JSON (sources, counts, failures, searches, direction handled)
  cost_usd         REAL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS stories (
  id               TEXT PRIMARY KEY,            -- date plus slug
  profile_id       TEXT NOT NULL REFERENCES profiles(id),
  run_id           TEXT NOT NULL REFERENCES runs(id),
  category         TEXT NOT NULL,               -- exactly one category id from the profile
  headline         TEXT NOT NULL,               -- the agent's headline
  url              TEXT NOT NULL,               -- the best coverage link
  published_at     TEXT,                        -- of the linked coverage
  surfaced_by      TEXT NOT NULL,               -- agenda source + feed, or discovery:<category>
  coverage         TEXT NOT NULL,               -- JSON array: {publisher, url, read_in_full, paywalled}
  newsworthiness   REAL NOT NULL,               -- 0..1
  relevance        REAL NOT NULL,               -- 0..1, kept separate so a merge can reweight
  summary          TEXT NOT NULL,
  why_it_matters   TEXT,
  basis            TEXT NOT NULL,               -- which coverage the summary was written from, or headline-only
  directed         INTEGER NOT NULL DEFAULT 0,
  related          TEXT,                        -- JSON array of earlier story ids
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS stories_profile_created ON stories (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stories_profile_url ON stories (profile_id, url);

CREATE TABLE IF NOT EXISTS editions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id   TEXT NOT NULL REFERENCES profiles(id),
  date         TEXT NOT NULL,                   -- YYYY-MM-DD, the edition's day
  run_id       TEXT NOT NULL REFERENCES runs(id),
  today        TEXT,                            -- JSON array of up to three story ids, the pointers
  body_md      TEXT NOT NULL,                   -- the rendered edition, markdown
  closing      TEXT,                            -- "From the desk": proposals, direction handled, status
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (profile_id, date)
);

CREATE TABLE IF NOT EXISTS direction (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id   TEXT NOT NULL REFERENCES profiles(id),
  action       TEXT NOT NULL CHECK (action IN ('research', 'file', 'add-interest', 'freeform')),
  payload      TEXT NOT NULL,                   -- a link, text, or both
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  handled_at   TEXT,
  result       TEXT                             -- the agent's note and a pointer to what it produced
);
