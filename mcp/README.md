# Instagram Insights MCP server

Read-only access to this instance's Instagram analytics, for Claude.

It runs **in-process against the database** — not against the Instagram API.
Everything it returns comes from the nightly capture, which means answers are
fast, work with no network, and can look further back than Instagram's own
30-day retention window.

## Setup

```bash
claude mcp add instagram-insights -- \
  npx tsx --tsconfig /ABSOLUTE/PATH/TO/openreply/tsconfig.json \
              /ABSOLUTE/PATH/TO/openreply/mcp/server.ts
```

**`--tsconfig` is required, not optional.** An MCP client launches the server
from whatever directory it happens to be in, and `tsx` resolves the `@/*` path
aliases against the *current working directory*. Without the flag, every tool
that touches `lib/` dies with `Cannot find module '@/lib/db/client'` — and
because the failure is lazy, `tools/list` still succeeds, so the server looks
healthy right up until you call something.

`DATABASE_URL` is read from the project's `.env.local` / `.env`, located
relative to this file rather than to the cwd, so it works from anywhere.

Nothing in here writes — there are no mutating tools to call.

### If it fails to connect

Run the same command by hand and look at **stdout**:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' \
  | npx tsx --tsconfig /ABS/PATH/tsconfig.json /ABS/PATH/mcp/server.ts
```

The first line must be JSON. stdout is the JSON-RPC channel, so *any* other
output there — a dependency's startup banner, a stray `console.log` — is parsed
as a protocol frame, fails, and drops the connection. `server.ts` rebinds
`console.log` to stderr to keep that from happening; diagnostics belong on
stderr.

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
