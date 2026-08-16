import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

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
    <html lang="en" className="h-full">
      <body className="min-h-full bg-background text-foreground font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
