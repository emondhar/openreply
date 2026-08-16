import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ManyChat by Emon",
  description: "Private instance. Nothing to see here.",
  // The share card is the joke's punchline, so it deliberately disagrees with
  // the tab title.
  openGraph: {
    title: "You found it.",
    description: "Private instance. Nothing to see here.",
  },
  twitter: {
    title: "You found it.",
    description: "Private instance. Nothing to see here.",
  },
};

const GITHUB_URL = "https://github.com/diwenne/openreply";

// Real numbers, and the last one is the joke. Nothing here is a projection or
// a rounded-up marketing figure — that was the point of replacing the previous
// block, which advertised "24/7 monitoring" like a product with customers.
const heroStats = [
  { value: "$0", label: "monthly subscription replaced" },
  { value: "~1s", label: "comment to DM" },
  { value: "1", label: "user" },
];

const flowSteps = [
  {
    eyebrow: "Watches",
    description:
      "A webhook catches every comment on the posts I've armed. A polling sweep picks up whatever Instagram forgets to push, because Instagram forgets a lot.",
  },
  {
    eyebrow: "Matches",
    description:
      "If the comment contains the keyword I set, it queues a DM and leaves a public reply so the thread doesn't look dead.",
  },
  {
    eyebrow: "Sends",
    description:
      "Official Instagram API, rate-limited, logged. No browser automation, no scraping, nothing that gets an account banned.",
  },
];

/* Static, faithful copies of the real Overview and Dashboard screens, built in
   the app's own design tokens so what visitors see is what the app looks like. */

function AppWindow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background shadow-2xl shadow-black/50">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="ml-2 text-xs text-muted">{label}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

const overviewStats = [
  ["Views", "847.2K"],
  ["Reach", "612.4K"],
  ["Likes", "38.1K"],
  ["Comments", "4,204"],
  ["Saved", "9,712"],
  ["Shares", "2,340"],
];

const overviewPosts = [
  ["Day 41 — the build", "214.8K", "9.1K", "Apr 3"],
  ["Tabla at 2am", "88.4K", "5.2K", "Mar 28"],
  ["Why I stopped", "51.3K", "3.4K", "Mar 21"],
];

function OverviewPreview() {
  return (
    <AppWindow label="app / overview">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Overview</h3>
          <p className="mt-1 text-xs text-muted">
            Recent — 24 posts from @emondhar
          </p>
        </div>
        <span className="rounded border border-border px-2 py-1 text-xs text-muted">
          Last 50
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {overviewStats.map(([label, value]) => (
          <Stat key={label} label={label} value={value} />
        ))}
      </div>

      <div className="mt-4 rounded border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-foreground">
            Followers over time
          </p>
          <p className="text-xs text-muted tabular-nums">
            48,210 <span className="text-success">+1,240</span> · 30d
          </p>
        </div>
        <svg
          viewBox="0 0 300 64"
          preserveAspectRatio="none"
          className="mt-3 h-16 w-full"
          aria-hidden="true"
        >
          <polyline
            points="0,54 43,49 86,51 129,40 171,36 214,26 257,20 300,9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className="text-accent"
          />
        </svg>
      </div>

      <div className="mt-4 rounded border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-foreground">Posts</p>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <th className="pb-2 pr-3 font-medium">Post</th>
              <th className="pb-2 px-3 text-right font-medium">Views</th>
              <th className="pb-2 px-3 text-right font-medium">Likes</th>
              <th className="pb-2 pl-3 text-right font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {overviewPosts.map(([post, views, likes, date]) => (
              <tr key={post} className="border-b border-border last:border-0">
                <td className="py-2 pr-3 text-foreground">{post}</td>
                <td className="py-2 px-3 text-right tabular-nums text-muted">
                  {views}
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-muted">
                  {likes}
                </td>
                <td className="py-2 pl-3 text-right text-zinc-500">{date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppWindow>
  );
}

function MatchedCommentCard() {
  return (
    <div className="w-64 rounded-lg border border-border bg-surface p-4 shadow-2xl shadow-black/50">
      <p className="text-xs text-muted">New comment</p>
      <p className="mt-1 text-sm font-semibold text-foreground">@maya.co</p>
      <p className="mt-1 text-sm text-muted">LINK please</p>
      <div className="mt-3 border-t border-border pt-3">
        <p className="text-xs text-muted">
          Matched <span className="text-accent">LINK</span>
        </p>
        <p className="mt-1 text-sm font-medium text-success">
          Queued private reply
        </p>
      </div>
    </div>
  );
}

const dashboardStats = [
  ["Active Campaigns", "3"],
  ["DMs Sent", "1,284"],
  ["Skipped", "42"],
  ["Failed", "3"],
  ["Clicks", "356"],
  ["CTR", "27.7%"],
];

const dashboardChart: [string, number][] = [
  ["Mon", 42],
  ["Tue", 68],
  ["Wed", 51],
  ["Thu", 94],
  ["Fri", 120],
  ["Sat", 86],
  ["Sun", 73],
];

const dashboardActivity = [
  ["@maya.co", "Reel link", "Sent", "text-success"],
  ["@founder.ray", "Reel link", "Sent", "text-success"],
  ["@shop.ava", "Tabla course", "Queued", "text-warning"],
];

function DashboardPreview() {
  const maxDM = Math.max(...dashboardChart.map(([, n]) => n));
  return (
    <AppWindow label="app / dashboard">
      <h3 className="text-base font-semibold text-foreground">Hello, Emon!</h3>
      <p className="mt-1 text-xs text-muted">1 connected account · 340 contacts</p>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {dashboardStats.map(([label, value]) => (
          <Stat key={label} label={label} value={value} />
        ))}
      </div>

      <div className="mt-4 rounded border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-foreground">DMs — Last 7 Days</p>
        <div className="mt-4 flex h-32 items-end gap-2">
          {dashboardChart.map(([day, n]) => (
            <div key={day} className="flex flex-1 flex-col items-center gap-2">
              <span className="text-[10px] tabular-nums text-muted">{n}</span>
              <div
                className="w-full rounded-sm bg-accent"
                style={{ height: `${Math.max((n / maxDM) * 100, 4)}%` }}
              />
              <span className="text-[10px] text-zinc-500">{day}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-foreground">Recent Activity</p>
        <div className="mt-3 space-y-2">
          {dashboardActivity.map(([user, automation, status, color]) => (
            <div
              key={user}
              className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-0"
            >
              <span className="truncate text-foreground">{user}</span>
              <span className="truncate text-muted">{automation}</span>
              <span className={`text-sm ${color}`}>{status}</span>
            </div>
          ))}
        </div>
      </div>
    </AppWindow>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-zinc-900">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-3"
            aria-label="ManyChat by Emon home"
          >
            <span className="text-lg font-bold text-zinc-900">
              ManyChat by Emon
            </span>
          </Link>

          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 bg-orange-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-600"
          >
            Sign in
          </Link>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-16 pt-12 sm:px-6 sm:pt-18 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:pb-24">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-600">
            Private instance · Not for sale
          </div>

          <h1 className="mt-7 text-balance text-5xl font-black leading-[1.02] text-zinc-900 sm:text-6xl lg:text-7xl">
            Hey. You found my special ManyChat.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600">
            This is the thing that DMs you the link when you comment a keyword
            on my reel. It runs on my own server, on the official Meta API, and
            it costs me roughly nothing — which was the entire point.
          </p>

          <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-600">
            There&rsquo;s no signup. If you don&rsquo;t already have a login,
            you&rsquo;re in the wrong place, and honestly, good for you for
            poking around.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 bg-orange-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
            >
              Sign in
            </Link>
            <a
              href="#why"
              className="inline-flex items-center justify-center border border-zinc-200 bg-white px-6 py-3 text-sm font-bold text-zinc-900 transition hover:border-zinc-300 hover:bg-zinc-100"
            >
              Why this exists
            </a>
          </div>

          <dl className="mt-10 grid max-w-xl grid-cols-3 gap-3">
            {heroStats.map((stat) => (
              <div key={stat.label} className="border border-zinc-200 bg-zinc-50 p-4">
                <dt className="text-2xl font-black tabular-nums text-zinc-900">
                  {stat.value}
                </dt>
                <dd className="mt-1 text-xs leading-5 text-zinc-500">
                  {stat.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative">
          <OverviewPreview />
          <div className="absolute -bottom-8 -left-6 hidden lg:block">
            <MatchedCommentCard />
          </div>
        </div>
      </section>

      <section
        id="why"
        className="border-y border-zinc-200 bg-zinc-50 py-20 scroll-mt-16"
      >
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase text-orange-600">
              Why this exists
            </p>
            <h2 className="mt-3 text-4xl font-black leading-tight text-zinc-900 sm:text-5xl">
              The short version
            </h2>
            <p className="mt-5 text-base leading-8 text-zinc-600">
              ManyChat wanted a subscription to send one link when someone
              comments one word. I looked at the pricing page, closed the tab,
              and forked OpenReply instead.
            </p>
            <p className="mt-4 text-base leading-8 text-zinc-600">
              Now it sits on my own domain, sends my own DMs, and charges me
              nothing when a reel actually works. That&rsquo;s the whole story.
              There&rsquo;s no startup here.
            </p>
          </div>
        </div>
      </section>

      <section
        id="how"
        className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-6 lg:px-8 scroll-mt-16"
      >
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase text-orange-600">
              How it works
            </p>
            <h2 className="mt-3 text-4xl font-black leading-tight text-zinc-900 sm:text-5xl">
              What it actually does
            </h2>
          </div>

          <div className="grid gap-4">
            {flowSteps.map((step) => (
              <article
                key={step.eyebrow}
                className="grid gap-4 border border-zinc-200 bg-zinc-50 p-5 sm:grid-cols-[120px_1fr]"
              >
                <p className="text-sm font-bold text-orange-600">
                  {step.eyebrow}
                </p>
                <p className="text-sm leading-6 text-zinc-600">
                  {step.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-zinc-200 bg-zinc-50 py-20">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:items-center">
          <DashboardPreview />

          <div>
            <p className="text-sm font-bold uppercase text-orange-600">
              The dashboard
            </p>
            <h2 className="mt-3 text-4xl font-black leading-tight text-zinc-900 sm:text-5xl">
              Everything is traceable
            </h2>
            <p className="mt-5 text-base leading-8 text-zinc-600">
              Queued, matched, sent, skipped, failed, rate-limited. If a DM
              didn&rsquo;t land, I know exactly where it died. That&rsquo;s the
              part I actually wanted.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-8 border border-orange-200 bg-orange-50 p-6 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <h2 className="max-w-3xl text-4xl font-black leading-tight text-zinc-900 sm:text-5xl">
              That&rsquo;s it. That&rsquo;s the page.
            </h2>
            <p className="mt-4 text-base leading-7 text-zinc-600">
              If you&rsquo;re logged in, the dashboard is behind the button. If
              you&rsquo;re not, go watch the reel that sent you here.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 bg-orange-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
          >
            Sign in
          </Link>
        </div>
      </section>

      <footer className="border-t border-zinc-200 py-8">
        <div className="mx-auto w-full max-w-6xl space-y-2 px-5 text-sm leading-6 text-zinc-500 sm:px-6 lg:px-8">
          <p className="font-semibold text-zinc-600">
            ManyChat by Emon · Private instance, self-hosted in Montreal.
          </p>
          <p>
            Forked from{" "}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 transition hover:text-zinc-900"
            >
              OpenReply
            </a>{" "}
            by diwenne. Open source, and it saved me a subscription —{" "}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 transition hover:text-zinc-900"
            >
              go star it
            </a>
            .
          </p>
          <p>Not affiliated with ManyChat Inc. in any way whatsoever.</p>
        </div>
      </footer>
    </main>
  );
}
