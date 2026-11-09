"use client";

/**
 * SignInFigure: the person cutout (public/brand/signin-photo.png, a transparent PNG) filling the lower part of the sign-in panel.
 * Decorative (empty alt). The page gives it a HEIGHT (a share of the panel's height, bottom-anchored) and its width follows
 * (w-auto): the natural aspect ratio is never stretched, and the panel's overflow-hidden crops what runs past the right edge. It never takes a click.
 * If the file is missing or fails to load it renders nothing, so the panel is simply the gradient without the figure.
 * (A small source file, under about 1000px wide, looks soft at this size: supply a larger cutout at the same path.)
 *
 * Props: className (position it: the page uses "absolute bottom-0 ..."), style (the data-driven left offset)
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/cn";

/** Where the cutout goes (public/brand/signin-photo.png). */
export const SIGNIN_FIGURE_SRC = "/brand/signin-photo.png";

export function SignInFigure({ className, style }: { className?: string; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // It can fail before React has attached onError (server-rendered page): check once after mount too.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) return null;
  return (
    // A plain img (optional file; onError hides it). Decorative: alt="" and aria-hidden.
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={SIGNIN_FIGURE_SRC} alt="" aria-hidden="true" onError={() => setFailed(true)} data-testid="signin-figure" style={style} className={cn("pointer-events-none w-auto max-w-none object-contain object-bottom", className)} />
  );
}
