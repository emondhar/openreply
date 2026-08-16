-- DmLog carries the most rows in the schema and every analytics read filters it
-- on some combination of workspace, status and time. Until now the table only
-- had single-column indexes, so Postgres could use one and had to filter the
-- rest by scanning.
--
-- These are plain (non-concurrent) builds because Prisma runs a migration file
-- inside one transaction and CREATE INDEX CONCURRENTLY cannot run there. On a
-- large existing table that means a write lock for the duration of the build —
-- if this instance has a big DmLog, run the four CREATE INDEX CONCURRENTLY
-- statements by hand first, then `prisma migrate resolve --applied` this
-- migration, since the IF NOT EXISTS guards make it a no-op afterwards.

-- The stats aggregation: counts for today / week / month, all SENT-filtered.
CREATE INDEX IF NOT EXISTS "DmLog_workspaceId_status_createdAt_idx"
  ON "DmLog" ("workspaceId", "status", "createdAt");

-- The logs table and the dashboard's recent-activity feed, which order by time
-- within a workspace and do not filter on status.
CREATE INDEX IF NOT EXISTS "DmLog_workspaceId_createdAt_idx"
  ON "DmLog" ("workspaceId", "createdAt");

-- The same reads with an account filter applied from the account selector.
CREATE INDEX IF NOT EXISTS "DmLog_workspaceId_instagramAccountId_createdAt_idx"
  ON "DmLog" ("workspaceId", "instagramAccountId", "createdAt");

-- Per-campaign analytics on the campaigns list.
CREATE INDEX IF NOT EXISTS "DmLog_automationId_status_idx"
  ON "DmLog" ("automationId", "status");

-- Superseded by the composites above: five distinct values across the table
-- made this unusable on its own, and it is now a redundant write cost.
DROP INDEX IF EXISTS "DmLog_status_idx";
