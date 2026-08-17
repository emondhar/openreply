# Instagram Insights MCP server

Read-only access to this instance's Instagram analytics, for Claude.

It runs **in-process against the database** — not against the Instagram API.
Everything it returns comes from the nightly capture, which means answers are
fast, work with no network, and can look further back than Instagram's own
30-day retention window.

## Setup

```bash
claude mcp add instagram-insights -- npx tsx /ABSOLUTE/PATH/TO/openreply/mcp/server.ts
```

It reads `DATABASE_URL` from the project's `.env`, so it sees the same data the
dashboard does. Nothing in here writes — there are no mutating tools to call.

## Tools

| Tool | Answers |
| --- | --- |
| `list_accounts` | Which Instagram accounts are connected |
| `insight_coverage` | How much history exists yet, and from when |
| `audience_mismatch` | Who follows you vs who actually engages |
| `reach_split` | Did content reach new people or the same people again |
| `reel_retention` | How much of each reel is watched, normalised by length |
| `content_funnel` | Reach → interaction → follow → DM → click, per post |
| `top_posts` | Best posts by a chosen metric over a window |
| `campaign_performance` | Keyword campaigns by DMs sent and clicks earned |

## The one thing to know about the numbers

Instagram returns only the **top 45 buckets** per demographic breakdown, so
percentages are shares of what it returned, not of your whole audience. Small
cities and rare age brackets are truncated upstream and cannot be recovered.
Every tool that reports a share says so in its output.
