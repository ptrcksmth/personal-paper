-- v2.1.2: category becomes subtopic (docs/prds/v2.1.2-subtopic.md, decision D1).
-- Renames in place; rows do not move. No index includes the column.
-- Existing databases apply this once, after 2026-10-25-topic.sql:
--   npx wrangler d1 execute personal-paper --local  --file hosted/migrations/2026-10-25-subtopic.sql
--   npx wrangler d1 execute personal-paper --remote --file hosted/migrations/2026-10-25-subtopic.sql
-- Fresh databases use hosted/schema.sql, which carries the new names.
ALTER TABLE stories RENAME COLUMN category TO subtopic;
ALTER TABLE candidates RENAME COLUMN category TO subtopic;
