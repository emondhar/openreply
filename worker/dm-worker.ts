import { createDMWorker } from "@/lib/queue/dm-worker";
import { recordWorkerHeartbeat } from "@/lib/ops/worker-health";
import { reconcileComments } from "@/lib/polling/comment-reconciler";
import { syncPostRules } from "@/lib/campaigns/enrollment";
import os from "node:os";

const worker = createDMWorker();
const startedAt = new Date().toISOString();
const HEARTBEAT_INTERVAL_MS = 30_000;
// Polling safety net for comments that webhooks miss. Runs in the worker because
// it must fire every few minutes and Vercel's free crons only run once a day.
const POLL_INTERVAL_MS = Number(
  process.env.COMMENT_POLL_INTERVAL_MS ?? 5 * 60_000
);
// Enrolls posts into rule-driven campaigns. The worker already enrolls a post
// the first time a comment arrives on it, so this is the slower backstop: it
// picks up posts nobody has commented on yet (so the campaign's post list is
// right in the UI) and repairs anything the fast path missed across a restart.
// Less urgent than the comment sweep, hence the longer default.
const RULE_SYNC_INTERVAL_MS = Number(
  process.env.RULE_SYNC_INTERVAL_MS ?? 15 * 60_000
);

console.log("[DM Worker] Started");

async function heartbeat() {
  try {
    await recordWorkerHeartbeat({
      pid: process.pid,
      hostname: os.hostname(),
      startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[DM Worker] Heartbeat failed:", message);
  }
}

void heartbeat();
const heartbeatTimer = setInterval(() => void heartbeat(), HEARTBEAT_INTERVAL_MS);

async function poll() {
  try {
    await reconcileComments();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[DM Worker] Comment reconciliation failed:", message);
  }
}

// Kick off one sweep shortly after boot, then on a fixed interval.
setTimeout(() => void poll(), 10_000);
const pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);

async function syncRules() {
  try {
    const stats = await syncPostRules();
    const enrolled = stats.reduce((sum, s) => sum + s.enrolled, 0);
    if (enrolled > 0) {
      console.log(`[DM Worker] Rule sync enrolled ${enrolled} post(s)`);
    }
    for (const stat of stats) {
      for (const error of stat.errors) {
        console.error(`[DM Worker] Rule sync (${stat.instagramAccountId}): ${error}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[DM Worker] Rule sync failed:", message);
  }
}

// Offset from the comment sweep so the two don't hit the Graph API together.
setTimeout(() => void syncRules(), 30_000);
const ruleSyncTimer = setInterval(() => void syncRules(), RULE_SYNC_INTERVAL_MS);

async function shutdown(signal: string) {
  console.log(`[DM Worker] ${signal} received, closing worker`);
  clearInterval(heartbeatTimer);
  clearInterval(pollTimer);
  clearInterval(ruleSyncTimer);
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
