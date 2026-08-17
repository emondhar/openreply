import type { Metadata } from "next";
import type { CSSProperties } from "react";
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
// a rounded-up marketing figure.
const heroStats = [
  { value: "$0", label: "monthly subscription replaced" },
  { value: "~1s", label: "comment to DM" },
  { value: "1", label: "user" },
];

const flowSteps = [
  {
    name: "Watches",
    description:
      "A webhook catches every comment on the posts I've armed. A polling sweep picks up whatever Instagram forgets to push, because Instagram forgets a lot.",
  },
  {
    name: "Matches",
    description:
      "If the comment contains the keyword I set, it queues a DM and leaves a public reply so the thread doesn't look dead.",
  },
  {
    name: "Sends",
    description:
      "Official Instagram API, rate-limited, logged. No browser automation, no scraping, nothing that gets an account banned.",
  },
];

/** Section eyebrow. `sig` is the signature colour for that section's mark. */
function Eyebrow({ children, sig }: { children: string; sig: string }) {
  return (
    <p className="b-eyebrow" style={{ "--sig": sig } as CSSProperties}>
      {children}
    </p>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="b-glass sticky top-0 z-40 border-b border-border">
        <div className="b-container flex h-16 w-full items-center justify-between">
          <Link href="/" aria-label="ManyChat by Emon home">
            <span className="b-display text-lg">
              ManyChat by <span className="b-script">E</span>mon
            </span>
          </Link>

          <Link href="/login" className="b-pill b-pill--filled">
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero. One column, left-aligned, nothing beside it — the page has
          nothing to demonstrate, so a product shot would only be inventing
          something to look at. */}
      <section className="b-container w-full pb-(--section-y) pt-(--header-y)">
        <Eyebrow sig="var(--lime)">Private instance · Not for sale</Eyebrow>

        <h1 className="b-display mt-6 max-w-[16ch] text-[clamp(2.6rem,7.4vw,5.5rem)]">
          Hey. You found my special Many<span className="b-script">C</span>hat.
        </h1>

        <div className="mt-8 max-w-(--measure) space-y-4 text-lg leading-8 text-muted">
          <p>
            This is the thing that DMs you the link when you comment a keyword
            on my reel. It runs on my own server, on the official Meta API, and
            it costs me roughly nothing — which was the entire point.
          </p>
          <p>
            There&rsquo;s no signup. If you don&rsquo;t already have a login,
            you&rsquo;re in the wrong place, and honestly, good for you for
            poking around.
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/login" className="b-pill b-pill--filled">
            Sign in
          </Link>
          <a href="#why" className="b-pill">
            Why this exists
          </a>
        </div>

        {/* Ruled columns rather than boxed tiles: three numbers do not need
            three containers to be read as a set. */}
        <dl className="mt-(--block-y) grid max-w-2xl grid-cols-1 border-t border-border sm:grid-cols-3">
          {heroStats.map((stat) => (
            <div
              key={stat.label}
              className="border-b border-border py-5 sm:border-b-0 sm:pr-6"
            >
              <dt className="b-display text-3xl tabular-nums text-foreground">
                {stat.value}
              </dt>
              <dd className="mt-1.5 text-sm leading-5 text-muted">
                {stat.label}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        id="why"
        className="b-container w-full scroll-mt-16 border-t border-border py-(--section-y)"
      >
        <Eyebrow sig="var(--pink)">Why this exists</Eyebrow>
        <h2 className="b-display mt-5 max-w-[14ch] text-[clamp(2rem,4.6vw,3.4rem)]">
          The short <span className="b-script">v</span>ersion
        </h2>
        <div className="mt-7 max-w-(--measure) space-y-4 text-base leading-8 text-muted">
          <p>
            ManyChat wanted a subscription to send one link when someone
            comments one word. I looked at the pricing page, closed the tab, and
            forked OpenReply instead.
          </p>
          <p>
            Now it sits on my own domain, sends my own DMs, and charges me
            nothing when a reel actually works. That&rsquo;s the whole story.
            There&rsquo;s no startup here.
          </p>
        </div>
      </section>

      <section className="b-container w-full border-t border-border py-(--section-y)">
        <Eyebrow sig="var(--cyan)">How it works</Eyebrow>
        <h2 className="b-display mt-5 max-w-[14ch] text-[clamp(2rem,4.6vw,3.4rem)]">
          What it <span className="b-script">a</span>ctually does
        </h2>

        {/* Numbered because the order is information here — a comment is
            watched, then matched, then sent — not because numbers decorate. */}
        <ol className="mt-(--block-y) max-w-3xl">
          {flowSteps.map((step, i) => (
            <li
              key={step.name}
              className="grid gap-x-6 gap-y-2 border-t border-border py-7 sm:grid-cols-[3rem_9rem_1fr]"
            >
              <span className="text-sm tabular-nums text-muted-2">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="b-display text-base text-foreground">
                {step.name}
              </h3>
              <p className="text-base leading-7 text-muted">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* The one dark moment on the page, the way emondhar.com turns its story
          section to night. Every token inside re-points itself. */}
      <section className="night border-y border-border py-(--section-y)">
        <div className="b-container w-full">
          <Eyebrow sig="var(--yellow)">The dashboard</Eyebrow>
          <h2 className="b-display mt-5 max-w-[16ch] text-[clamp(2rem,4.6vw,3.4rem)]">
            Everything is tra<span className="b-script">c</span>eable
          </h2>
          <p className="mt-7 max-w-(--measure) text-base leading-8 text-muted">
            Queued, matched, sent, skipped, failed, rate-limited. If a DM
            didn&rsquo;t land, I know exactly where it died. That&rsquo;s the
            part I actually wanted.
          </p>
        </div>
      </section>

      <section className="b-container w-full py-(--section-y)">
        <h2 className="b-display max-w-[18ch] text-[clamp(2rem,4.6vw,3.4rem)]">
          That&rsquo;s it. That&rsquo;s the{" "}
          <span className="b-script">p</span>age.
        </h2>
        <p className="mt-6 max-w-(--measure) text-base leading-8 text-muted">
          If you&rsquo;re logged in, the dashboard is behind the button. If
          you&rsquo;re not, go watch the reel that sent you here.
        </p>
        <Link href="/login" className="b-pill b-pill--filled mt-8">
          Sign in
        </Link>
      </section>

      <footer className="border-t border-border py-10">
        <div className="b-container w-full space-y-2 text-sm leading-6 text-muted">
          <p className="text-foreground">
            ManyChat by Emon · Private instance, self-hosted in Montreal.
          </p>
          <p>
            Forked from{" "}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="text-accent-strong underline underline-offset-2"
            >
              OpenReply
            </a>{" "}
            by diwenne. Open source, and it saved me a subscription —{" "}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="text-accent-strong underline underline-offset-2"
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
