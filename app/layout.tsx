import type { Metadata } from "next";
import { Inter, Playfair_Display, Red_Hat_Display } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// The same three roles emondhar.com runs, so this reads as the same hand.
// Display: heavy geometric sans, uppercased by CSS. Serif italic: the accent
// letter inside a headline. Body: Inter, which the reference's body metrics
// (1.0625rem / 1.4706 / -0.01em) are tuned for — system-ui would be SF on a
// Mac and Segoe on Windows, a different texture on every machine.
const display = Red_Hat_Display({
  subsets: ["latin"],
  weight: ["800"],
  variable: "--font-display",
  display: "swap",
});

// 700 only. The reference ships 400 as well for its serif pull-quotes, but the
// only thing that face does here is the accent letter inside a headline, and
// that is always 700 — Playfair's italic capitals are high-contrast enough that
// at 400 inside 800 display caps they read as amputated rather than thin.
// Carrying the unused weight cost ~23 KB of preloaded font for nothing.
const serif = Playfair_Display({
  subsets: ["latin"],
  weight: ["700"],
  style: "italic",
  variable: "--font-serif",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// Fallback metadata for routes that do not set their own — the dashboard,
// login, and the legal pages. The marketing SEO routes each define their own
// title and description and are unaffected by this.
export const metadata: Metadata = {
  title: "ManyChat by Emon",
  description: "Private instance. Nothing to see here.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // No `dark` class here. The stylesheet declares `color-scheme: light` and
    // a light palette, and the codebase has no `dark:` variants — the class
    // did nothing except contradict the file every page inherits from. If a
    // dark theme is built later, this is where it opts in, alongside a matching
    // `color-scheme` in globals.css.
    <html
      lang="en"
      className={`h-full ${display.variable} ${serif.variable} ${body.variable}`}
    >
      <body className="min-h-full bg-background text-foreground font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
