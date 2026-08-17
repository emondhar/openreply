#!/usr/bin/env -S npx tsx
/**
 * Instagram insights, exposed to Claude over MCP.
 *
 * Read-only by construction. There are no mutating tools here, so Claude can
 * reason about the account without any path to changing a live campaign that
 * sends real DMs to real people.
 *
 * It queries the database, not Instagram. Everything it serves comes from the
 * nightly capture, which makes answers fast, available offline, and able to
 * reach further back than Instagram's own 30-day retention.
 *
 * Run:
 *   claude mcp add instagram-insights -- npx tsx /abs/path/mcp/server.ts
 */

import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client.js";

loadEnv();

if (!process.env.DATABASE_URL) {
  console.error(
    "[instagram-insights] DATABASE_URL is not set. The server reads the " +
      "project's .env; run it from the repo root or export DATABASE_URL."
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL),
});

const server = new McpServer({
  name: "instagram-insights",
  version: "1.0.0",
});

/** Every tool answers with JSON text; Claude reads structure better than prose. */
function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/**
 * Instagram truncates every demographic breakdown to its top 45 buckets, so a
 * percentage is a share of what it returned rather than of the real audience.
 * Saying so on the payload keeps that caveat attached to the number instead of
 * living only in documentation Claude will not have read.
 */
const TOP_45_NOTE =
  "Percentages are shares of the top-45 buckets Instagram returns, not of the " +
  "full audience. Small cities and rare age brackets are truncated upstream.";

/** Resolve a username or id to an account row. */
async function resolveAccount(ref?: string) {
  if (!ref) {
    const first = await prisma.instagramAccount.findFirst({
      orderBy: { connectedAt: "desc" },
      select: { id: true, username: true },
    });
    if (!first) throw new Error("No Instagram account is connected to this instance.");
    return first;
  }
  const clean = ref.replace(/^@/, "");
  const found = await prisma.instagramAccount.findFirst({
    where: { OR: [{ id: ref }, { username: clean }, { instagramId: ref }] },
    select: { id: true, username: true },
  });
  if (!found) throw new Error(`No connected account matches "${ref}".`);
  return found;
}

const accountArg = {
  account: z
    .string()
    .optional()
    .describe("Username or account id. Omit to use the most recently connected."),
};

// ---------------------------------------------------------------- accounts

server.registerTool(
  "list_accounts",
  {
    title: "List connected accounts",
    description:
      "Every Instagram account connected to this instance, with follower count " +
      "and when it was connected. Start here if unsure which account to query.",
    inputSchema: {},
  },
  async () => {
    const accounts = await prisma.instagramAccount.findMany({
      orderBy: { connectedAt: "desc" },
      select: {
        id: true,
        username: true,
        name: true,
        connectedAt: true,
        _count: { select: { automations: true, dmLogs: true } },
      },
    });
    return json({ accounts });
  }
);

server.registerTool(
  "insight_coverage",
  {
    title: "Check how much history exists",
    description:
      "How many snapshot rows have been captured and over what date range. " +
      "Call this before trusting a trend: the nightly capture only started " +
      "recently, and Instagram keeps no history of its own to backfill from.",
    inputSchema: accountArg,
  },
  async ({ account }) => {
    const { id, username } = await resolveAccount(account);
    const { getInsightCoverage } = await import("../lib/insights/queries.js");
    const coverage = await getInsightCoverage(id);
    return json({ account: username, ...coverage });
  }
);

// ---------------------------------------------------------------- audience

server.registerTool(
  "audience_mismatch",
  {
    title: "Who follows you vs who engages",
    description:
      "Compares follower demographics against engaged-audience demographics for " +
      "one dimension. Positive delta = that group engages harder than its size " +
      "suggests, so more content aimed at them is the cheapest growth available. " +
      "Negative delta = they followed for something you have stopped making. " +
      "This is the most actionable thing Instagram's aggregates can produce and " +
      "no native dashboard shows it.",
    inputSchema: {
      ...accountArg,
      dimension: z
        .enum(["AGE", "GENDER", "CITY", "COUNTRY"])
        .default("AGE")
        .describe("Which demographic breakdown to compare."),
    },
  },
  async ({ account, dimension }) => {
    const { id, username } = await resolveAccount(account);
    const { getAudienceMismatch } = await import("../lib/insights/queries.js");
    const rows = await getAudienceMismatch(id, dimension);
    if (!rows.length) {
      return json({
        account: username,
        dimension,
        rows: [],
        note:
          "No demographic data captured yet. Instagram requires 100+ followers " +
          "(and 100+ engagers) before it will return these, and the nightly " +
          "capture must have run at least once.",
      });
    }
    return json({ account: username, dimension, rows, note: TOP_45_NOTE });
  }
);

// ---------------------------------------------------------------- reach

server.registerTool(
  "reach_split",
  {
    title: "Reach: followers vs new people",
    description:
      "Daily reach split into people who already follow the account and people " +
      "who do not. The growth question — a total reach figure cannot tell an " +
      "account showing the same 5,000 people every post from one finding 5,000 " +
      "new people, and those need opposite fixes.",
    inputSchema: {
      ...accountArg,
      days: z.number().int().min(1).max(365).default(30),
    },
  },
  async ({ account, days }) => {
    const { id, username } = await resolveAccount(account);
    const { getReachSplit } = await import("../lib/insights/queries.js");
    const points = await getReachSplit(id, days);
    const totalReach = points.reduce((n, p) => n + p.total, 0);
    const totalNew = points.reduce((n, p) => n + p.nonFollower, 0);
    return json({
      account: username,
      days,
      points,
      summary: {
        totalReach,
        newAudienceReach: totalNew,
        newAudiencePct: totalReach ? (totalNew / totalReach) * 100 : null,
      },
    });
  }
);

// ---------------------------------------------------------------- content

server.registerTool(
  "reel_retention",
  {
    title: "Reel watch-through rates",
    description:
      "Average watch time per reel. Raw watch time is close to meaningless on " +
      "its own — six seconds is excellent on a 15s reel and poor on a 90s one — " +
      "so pass clip durations to get a normalised retention percentage.",
    inputSchema: {
      ...accountArg,
      limit: z.number().int().min(1).max(100).default(25),
      durationsMs: z
        .record(z.string(), z.number())
        .optional()
        .describe(
          "Optional map of mediaId -> clip duration in ms. Without it, " +
            "retentionPct is null and only raw watch time is returned."
        ),
    },
  },
  async ({ account, limit, durationsMs }) => {
    const { id, username } = await resolveAccount(account);
    const { getReelRetention } = await import("../lib/insights/queries.js");
    const reels = await getReelRetention(id, durationsMs ?? {}, limit);
    return json({
      account: username,
      reels,
      note: durationsMs
        ? undefined
        : "retentionPct is null because no clip durations were supplied.",
    });
  }
);

server.registerTool(
  "content_funnel",
  {
    title: "Reach to follow to DM to click, per post",
    description:
      "The full funnel for each post: reach, interactions, profile visits, " +
      "follows gained, then the DMs this instance actually sent from its " +
      "comments and the tracked-link clicks those earned. Instagram can tell " +
      "you a post reached 50,000 people; only this app knows how many of them " +
      "commented a keyword and clicked the link.",
    inputSchema: {
      ...accountArg,
      limit: z.number().int().min(1).max(100).default(25),
    },
  },
  async ({ account, limit }) => {
    const { id, username } = await resolveAccount(account);
    const { getContentFunnel } = await import("../lib/insights/queries.js");
    const posts = await getContentFunnel(id, limit);
    return json({ account: username, posts });
  }
);

server.registerTool(
  "top_posts",
  {
    title: "Best posts by a chosen metric",
    description:
      "Ranks captured posts by one metric. Use `follows` to find what actually " +
      "grew the account rather than what merely got likes — they are usually " +
      "different posts.",
    inputSchema: {
      ...accountArg,
      metric: z
        .enum([
          "views",
          "reach",
          "likes",
          "comments",
          "saved",
          "shares",
          "totalInteractions",
          "follows",
          "profileVisits",
        ])
        .default("reach"),
      days: z.number().int().min(1).max(365).default(90),
      limit: z.number().int().min(1).max(50).default(10),
    },
  },
  async ({ account, metric, days, limit }) => {
    const { id, username } = await resolveAccount(account);
    const since = new Date(Date.now() - days * 86_400_000);

    const rows = await prisma.mediaMetricSnapshot.findMany({
      where: { instagramAccountId: id, publishedAt: { gte: since } },
      orderBy: { capturedAt: "desc" },
    });

    // Latest capture per media, then rank.
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!latest.has(r.mediaId)) latest.set(r.mediaId, r);

    const ranked = [...latest.values()]
      .filter((r) => r[metric] != null)
      .sort((a, b) => (b[metric] as number) - (a[metric] as number))
      .slice(0, limit)
      .map((r) => ({
        mediaId: r.mediaId,
        mediaType: r.mediaType,
        permalink: r.permalink,
        caption: r.caption?.slice(0, 140) ?? null,
        publishedAt: r.publishedAt?.toISOString() ?? null,
        [metric]: r[metric],
      }));

    return json({ account: username, metric, days, posts: ranked });
  }
);

// ---------------------------------------------------------------- campaigns

server.registerTool(
  "campaign_performance",
  {
    title: "Keyword campaigns by DMs and clicks",
    description:
      "Every comment-to-DM campaign with what it actually delivered: DMs sent, " +
      "skipped and failed, tracked-link clicks, and click-through rate.",
    inputSchema: accountArg,
  },
  async ({ account }) => {
    const { id, username } = await resolveAccount(account);

    const [automations, statusCounts, clickCounts] = await Promise.all([
      prisma.automation.findMany({
        where: { instagramAccountId: id },
        select: {
          id: true,
          name: true,
          keywords: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.dmLog.groupBy({
        by: ["automationId", "status"],
        where: { instagramAccountId: id },
        _count: { _all: true },
      }),
      prisma.linkClick.groupBy({
        by: ["automationId"],
        where: { instagramAccountId: id },
        _count: { _all: true },
      }),
    ]);

    const clicksBy = new Map(clickCounts.map((c) => [c.automationId, c._count._all]));

    const campaigns = automations.map((a) => {
      let sent = 0, skipped = 0, failed = 0;
      for (const row of statusCounts) {
        if (row.automationId !== a.id) continue;
        const n = row._count._all;
        if (row.status === "SENT") sent += n;
        else if (row.status === "FAILED") failed += n;
        else if (String(row.status).startsWith("SKIPPED_")) skipped += n;
      }
      const clicks = clicksBy.get(a.id) ?? 0;
      return {
        name: a.name,
        keywords: a.keywords,
        isActive: a.isActive,
        createdAt: a.createdAt.toISOString(),
        sent,
        skipped,
        failed,
        clicks,
        clickThroughPct: sent ? (clicks / sent) * 100 : null,
      };
    });

    return json({ account: username, campaigns });
  }
);

// ---------------------------------------------------------------- run

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error("[instagram-insights] fatal:", err);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
