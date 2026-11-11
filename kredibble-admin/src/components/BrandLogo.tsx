"use client";

/**
 * BrandLogo: the official Global Opportunity Desk logo, read from /brand/god-logo.png (drop the file in public/brand/).
 * Until that file exists (or if it fails to load) a clean text wordmark is shown instead, so the page never has a broken image.
 *
 * Props:
 * - className: classes for the image. It keeps its natural aspect ratio: set a max width (default 200px), never a fixed width AND height
 *   (in a flex column the parent must use self-start/self-center, or the flex stretch widens it)
 * - tone: "light" (white wordmark, for a dark background) or "dark" (ink wordmark, for a light one)
 */
import { useEffect, useRef, useState } from "react";
import { BRAND } from "@/config/brand";
import { cn } from "@/lib/cn";

/** Where the official logo file goes (public/brand/god-logo.png). */
export const BRAND_LOGO_SRC = "/brand/god-logo.png";

export function BrandLogo({ className, tone = "dark" }: { className?: string; tone?: "light" | "dark" }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // The image can fail before React has attached onError (server-rendered page): check once after mount too.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) {
    return (
      <div data-testid="brand-wordmark" className="flex flex-col leading-tight">
        <span className={cn("font-display text-2xl font-semibold", tone === "light" ? "text-white" : "text-ink")}>{BRAND.name}</span>
        <span className={cn("caption", tone === "light" ? "text-sb-text" : "text-muted")}>{BRAND.sub}</span>
      </div>
    );
  }
  return (
    // A plain img: the file is optional, and onError swaps in the wordmark (next/image cannot do that).
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={BRAND_LOGO_SRC} alt={`${BRAND.sub} logo`} onError={() => setFailed(true)} data-testid="brand-logo" className={cn("h-auto w-full max-w-50 object-contain", className)} />
  );
}
