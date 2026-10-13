import type { Metadata } from "next";
import localFont from "next/font/local";
import { BRAND, BRAND_ADMIN_TITLE } from "@/config/brand";
import "./globals.css";

// Body font: Inter 400 / 500 / 600. Exposed as --font-inter, consumed by --font-sans in
// globals.css. display: "swap" shows the system fallback immediately, then swaps in Inter.
// Self-hosted variable woff2 (latin) via next/font/local: identical glyphs to the Google
// Fonts build, but the build never fetches from fonts.googleapis.com — immune to the
// intermittent extensionless-URL failure (vercel/next.js#99114) that breaks Turbopack builds.
const inter = localFont({
  src: "../fonts/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Arial", "sans-serif"],
});

// Display font for headings, card titles and KPI numbers: Plus Jakarta Sans 600 / 700 / 800.
// Exposed as --font-jakarta, consumed by --font-display in globals.css. Self-hosted for the
// same build-determinism reason as Inter above (variable range 200-800 covers all uses).
const jakarta = localFont({
  src: "../fonts/plus-jakarta-sans-latin-wght-normal.woff2",
  variable: "--font-jakarta",
  weight: "200 800",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: BRAND_ADMIN_TITLE,
  description: `${BRAND.sub} administration dashboard`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jakarta.variable} h-full antialiased`}>
      {/* suppressHydrationWarning (one level only): browser extensions add attributes to <html> and <body> before React
          hydrates, which Next.js dev reports as an issue. Nothing below these two tags is affected. */}
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-canvas text-ink">{children}</body>
    </html>
  );
}
