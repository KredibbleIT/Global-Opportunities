/**
 * BrandMark: the app logo (the gradient ring with the handshake on a white rounded tile), the same mark as the mobile app's icon.
 * The file is public/brand/app-logo.png (a 512px PNG, copied from kredibble-app/assets/images/logo-intro/app_logo.png); next/image
 * serves it at the size shown. It replaced the orange "G" tile on 2026-11-11 (owner request).
 *
 * Props:
 * - size: pixel size of the square (default 36)
 * - className: extra classes
 * Decorative (empty alt, aria-hidden): the product name is always shown beside it.
 */
import Image from "next/image";
import { cn } from "@/lib/cn";

/** Where the app logo lives (public/brand/app-logo.png). */
export const BRAND_MARK_SRC = "/brand/app-logo.png";

interface BrandMarkProps {
  size?: number;
  className?: string;
}

export function BrandMark({ size = 36, className }: BrandMarkProps) {
  return (
    <Image
      src={BRAND_MARK_SRC}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      data-testid="brand-mark"
      // The PNG's own corners are transparent; the radius keeps the tile's corners crisp at small sizes, and the faint ring gives the
      // white tile an edge on light pages (it disappears on the dark sidebar).
      className={cn("shrink-0 select-none rounded-[22%] ring-1 ring-black/5", className)}
      draggable={false}
    />
  );
}
