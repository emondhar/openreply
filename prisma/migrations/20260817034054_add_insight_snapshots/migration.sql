-- CreateEnum
CREATE TYPE "AudienceMetric" AS ENUM ('FOLLOWER', 'ENGAGED');

-- CreateEnum
CREATE TYPE "AudienceDimension" AS ENUM ('AGE', 'GENDER', 'CITY', 'COUNTRY');

-- CreateTable
CREATE TABLE "AudienceSnapshot" (
    "id" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "metric" "AudienceMetric" NOT NULL,
    "dimension" "AudienceDimension" NOT NULL,
    "bucket" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudienceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountMetricSnapshot" (
    "id" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "metric" TEXT NOT NULL,
    "breakdown" TEXT NOT NULL DEFAULT '',
    "bucket" TEXT NOT NULL DEFAULT '',
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaMetricSnapshot" (
    "id" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mediaType" TEXT,
    "permalink" TEXT,
    "caption" TEXT,
    "publishedAt" TIMESTAMP(3),
    "views" INTEGER,
    "reach" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "saved" INTEGER,
    "shares" INTEGER,
    "totalInteractions" INTEGER,
    "follows" INTEGER,
    "profileVisits" INTEGER,
    "avgWatchTimeMs" INTEGER,
    "skipRate" DOUBLE PRECISION,

    CONSTRAINT "MediaMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AudienceSnapshot_instagramAccountId_metric_dimension_date_idx" ON "AudienceSnapshot"("instagramAccountId", "metric", "dimension", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AudienceSnapshot_instagramAccountId_date_metric_dimension_b_key" ON "AudienceSnapshot"("instagramAccountId", "date", "metric", "dimension", "bucket");

-- CreateIndex
CREATE INDEX "AccountMetricSnapshot_instagramAccountId_metric_date_idx" ON "AccountMetricSnapshot"("instagramAccountId", "metric", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AccountMetricSnapshot_instagramAccountId_date_metric_breakd_key" ON "AccountMetricSnapshot"("instagramAccountId", "date", "metric", "breakdown", "bucket");

-- CreateIndex
CREATE INDEX "MediaMetricSnapshot_instagramAccountId_capturedAt_idx" ON "MediaMetricSnapshot"("instagramAccountId", "capturedAt");

-- CreateIndex
CREATE INDEX "MediaMetricSnapshot_mediaId_capturedAt_idx" ON "MediaMetricSnapshot"("mediaId", "capturedAt");

-- AddForeignKey
ALTER TABLE "AudienceSnapshot" ADD CONSTRAINT "AudienceSnapshot_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMetricSnapshot" ADD CONSTRAINT "AccountMetricSnapshot_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaMetricSnapshot" ADD CONSTRAINT "MediaMetricSnapshot_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
