-- v2.1.1: profile becomes topic (docs/prds/v2.1.1-topic.md, decision D1).
-- Renames in place; rows do not move. SQLite rewrites the foreign-key references,
-- unique constraints and index definitions in the other tables.
-- Existing databases apply this once:
--   npx wrangler d1 execute personal-paper --local  --file hosted/migrations/2026-10-25-topic.sql
--   npx wrangler d1 execute personal-paper --remote --file hosted/migrations/2026-10-25-topic.sql
-- Fresh databases use hosted/schema.sql, which carries the new names.
ALTER TABLE profiles RENAME TO topics;
ALTER TABLE profile_versions RENAME TO topic_versions;
ALTER TABLE topic_versions RENAME COLUMN profile_id TO topic_id;
ALTER TABLE runs RENAME COLUMN profile_id TO topic_id;
ALTER TABLE runs RENAME COLUMN profile_version TO topic_version;
ALTER TABLE stories RENAME COLUMN profile_id TO topic_id;
ALTER TABLE editions RENAME COLUMN profile_id TO topic_id;
ALTER TABLE direction RENAME COLUMN profile_id TO topic_id;
ALTER TABLE candidates RENAME COLUMN profile_id TO topic_id;
DROP INDEX IF EXISTS stories_profile_created;
DROP INDEX IF EXISTS stories_profile_url;
DROP INDEX IF EXISTS candidates_flagged;
CREATE INDEX IF NOT EXISTS stories_topic_created ON stories (topic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stories_topic_url ON stories (topic_id, url);
CREATE INDEX IF NOT EXISTS candidates_flagged ON candidates (topic_id, flagged_at);
