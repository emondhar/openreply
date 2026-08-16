-- Campaigns created before reportShareSlug existed had it filled in lazily by
-- GET /api/automations, which issued one UPDATE per slug-less campaign on a
-- read the user was waiting on. Both create paths have set the slug for a
-- while now, so the remaining rows are a fixed, finite set: backfill them once
-- here and the read path stops writing.
--
-- md5 over the row's own id (already unique) plus a clock reading keeps the
-- generated slugs collision-free without requiring the pgcrypto extension.
UPDATE "Automation"
SET "reportShareSlug" = substr(
  md5("id" || clock_timestamp()::text || random()::text), 1, 16
)
WHERE "reportShareSlug" IS NULL;
