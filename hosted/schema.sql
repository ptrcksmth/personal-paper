-- PersonalPaper hosted environment: schema
-- Cloudflare D1 (SQLite). Applied with: npx wrangler d1 execute personal-paper --file hosted/schema.sql
--
-- Seven tables, per PRD section 8.2 of v2.1, renamed by v2.1.1 (profile became topic;
-- existing databases apply hosted/migrations/2026-10-25-topic.sql). `owner` and `visibility` exist from day one so that
-- private rows in v2.2 need no migration; v2.1 never writes a private row.

CREATE TABLE IF NOT EXISTS topics (
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

CREATE TABLE IF NOT EXISTS topic_versions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id     TEXT NOT NULL REFERENCES topics(id),
  version      INTEGER NOT NULL,
  definition   TEXT NOT NULL,                   -- full definition, JSON
  note         TEXT,                            -- why this version exists
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (topic_id, version)
);

CREATE TABLE IF NOT EXISTS runs (
  id               TEXT PRIMARY KEY,            -- agent-chosen, e.g. 2026-10-18T06-global-us-news
  topic_id         TEXT NOT NULL REFERENCES topics(id),
  topic_version    INTEGER NOT NULL,
  started_at       TEXT NOT NULL,
  ended_at         TEXT,
  status           TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'degraded', 'failed')),
  log              TEXT,                        -- run log, JSON (sources, counts, failures, searches, direction handled)
  cost_usd         REAL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS stories (
  id               TEXT PRIMARY KEY,            -- date plus slug
  topic_id         TEXT NOT NULL REFERENCES topics(id),
  run_id           TEXT NOT NULL REFERENCES runs(id),
  category         TEXT NOT NULL,               -- exactly one category id from the topic
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
  image_url        TEXT,                        -- preview image from the coverage page's metadata, if any
  image_credit     TEXT,                        -- publisher to credit for it
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS stories_topic_created ON stories (topic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stories_topic_url ON stories (topic_id, url);

CREATE TABLE IF NOT EXISTS editions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id     TEXT NOT NULL REFERENCES topics(id),
  date         TEXT NOT NULL,                   -- YYYY-MM-DD, the edition's day
  run_id       TEXT NOT NULL REFERENCES runs(id),
  today        TEXT,                            -- JSON array of up to three story ids, the pointers
  body_md      TEXT NOT NULL,                   -- the rendered edition, markdown
  closing      TEXT,                            -- "From the desk": proposals, direction handled, status
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (topic_id, date)
);

CREATE TABLE IF NOT EXISTS direction (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id     TEXT NOT NULL REFERENCES topics(id),
  action       TEXT NOT NULL CHECK (action IN ('research', 'file', 'add-interest', 'freeform')),
  payload      TEXT NOT NULL,                   -- a link, text, or both
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  handled_at   TEXT,
  result       TEXT                             -- the agent's note and a pointer to what it produced
);

-- Every candidate the agent considered in a run, with the stage it left at and why.
-- This is the evaluation record: the owner reads it on the cuts page and flags what should have run.
CREATE TABLE IF NOT EXISTS candidates (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id       TEXT NOT NULL REFERENCES topics(id),
  run_id         TEXT NOT NULL REFERENCES runs(id),
  ref            TEXT NOT NULL,                 -- feed ref from fetch_feeds, or discovery:<category>:<n>
  title          TEXT NOT NULL,
  url            TEXT,
  source         TEXT,                          -- "Publisher / Feed"
  published_at   TEXT,
  category       TEXT,                          -- the category the agent assigned, if it got that far
  stage          TEXT NOT NULL CHECK (stage IN ('kept', 'not-kept', 'not-shortlisted', 'deprioritized', 'repeat', 'collapsed')),
  reason         TEXT,                          -- one line
  collapsed_into TEXT,                          -- ref of the candidate this one was merged into
  story_id       TEXT,                          -- when kept
  flagged_at     TEXT,                          -- owner flagged "should have run"
  flag_note      TEXT,
  flag_handled_at TEXT,                         -- the agent acted on the flag
  flag_result    TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (run_id, ref)
);
CREATE INDEX IF NOT EXISTS candidates_run ON candidates (run_id, stage);
CREATE INDEX IF NOT EXISTS candidates_flagged ON candidates (topic_id, flagged_at);

-- 2026-10-17: a preview image per story, from the coverage page's own metadata, with its credit.
-- (On an existing database, apply as: ALTER TABLE stories ADD COLUMN image_url TEXT; ALTER TABLE stories ADD COLUMN image_credit TEXT;)
