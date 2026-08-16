-- Group campaigns: one campaign can now cover many posts.
--
-- Automation.postId held a single media id. AutomationPost replaces it as the
-- source of truth for "which media triggers this campaign", and carries cached
-- Graph metadata so rendering a campaign never requires re-downloading the
-- account's media list. Automation.postId / postUrl survive as a mirror of the
-- primary post so the CSV importer and the public report keep working.
--
-- DmLog.postId records which post a comment came from. With one post per
-- campaign that was implied by automationId; it no longer is, and it is what
-- makes the per-post breakdown possible.

-- CreateEnum
CREATE TYPE "PostSource" AS ENUM ('MANUAL', 'RULE', 'NEXT_REEL');

-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "postRule" JSONB;

-- AlterTable
ALTER TABLE "DmLog" ADD COLUMN     "postId" TEXT;

-- CreateTable
CREATE TABLE "AutomationPost" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "source" "PostSource" NOT NULL DEFAULT 'MANUAL',
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "permalink" TEXT,
    "thumbnailUrl" TEXT,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "caption" TEXT,
    "postedAt" TIMESTAMP(3),
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationPost_mediaId_idx" ON "AutomationPost"("mediaId");

-- CreateIndex
CREATE INDEX "AutomationPost_automationId_excluded_idx" ON "AutomationPost"("automationId", "excluded");

-- CreateIndex
CREATE INDEX "AutomationPost_postedAt_idx" ON "AutomationPost"("postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationPost_automationId_mediaId_key" ON "AutomationPost"("automationId", "mediaId");

-- CreateIndex
-- NOTE: on a large DmLog this is a blocking build, exactly like the analytics
-- indexes added in 20260816230000. If that applies, run this by hand as
-- CREATE INDEX CONCURRENTLY and mark the migration
-- `prisma migrate resolve --applied 20260817090000_add_campaign_post_groups`.
CREATE INDEX "DmLog_automationId_postId_idx" ON "DmLog"("automationId", "postId");

-- AddForeignKey
ALTER TABLE "AutomationPost" ADD CONSTRAINT "AutomationPost_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing campaign with a post gets exactly one MANUAL row.
-- md5 rather than gen_random_bytes so this does not require pgcrypto — same
-- reasoning as 20260816230100_backfill_report_share_slugs. The id is derived
-- from (automationId, mediaId), which is unique by construction, so re-running
-- this statement is a no-op rather than a duplicate.
-- Thumbnail/caption are left null and filled lazily by the first rule sweep;
-- backfilling them would mean a Graph call per campaign during migration.
INSERT INTO "AutomationPost" ("id", "automationId", "mediaId", "permalink", "source", "addedAt")
SELECT substr(md5("id" || ':' || "postId"), 1, 25), "id", "postId", "postUrl", 'MANUAL', "createdAt"
FROM "Automation"
WHERE "postId" IS NOT NULL
ON CONFLICT ("automationId", "mediaId") DO NOTHING;

-- Backfill: historical logs get the post their campaign was bound to. Correct
-- because until this migration a campaign could only ever have had one.
UPDATE "DmLog" d
SET "postId" = a."postId"
FROM "Automation" a
WHERE d."automationId" = a."id"
  AND a."postId" IS NOT NULL
  AND d."postId" IS NULL;
