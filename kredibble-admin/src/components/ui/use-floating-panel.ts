"use client";

/**
 * useFloatingPanel: where a dropdown panel (Menu, Select) sits, so every dropdown behaves the same way.
 *
 * The panel is rendered in a PORTAL on document.body with position: fixed, so no scrolling or overflow-hidden parent (a dialog body,
 * a table card, a long form) can clip it, and it sits above other content (FLOATING_Z, above dialogs and sheets). This hook measures
 * the trigger and the panel and returns:
 *  - top (opens downward) or bottom (opens upward): it flips up when there is more room above than below,
 *  - left: clamped so the panel never leaves the viewport (8px margin), also at 360 and 390px,
 *  - maxHeight: the room on its side of the trigger (never more than `maxHeight`), so a tall list scrolls inside instead of
 *    running off the screen,
 *  - width: set when `matchWidth` is on (the panel is as wide as the trigger, at least `minWidth`).
 * It re-measures on every render while open and on scroll (any scroller) and resize, so the panel follows its trigger.
 * Until the first measurement it returns null: render the panel hidden (visibility) so it does not flash in the wrong place.
 */
import { useCallback, useLayoutEffect, useState, type RefObject } from "react";

/** The z-index of a floating panel: above Dialog (60), Toast (70) and the phone sheets (80). */
export const FLOATING_Z = "z-90";

export interface FloatingPosition {
  top?: number;
  bottom?: number;
  left: number;
  width?: number;
  maxHeight: number;
  placement: "down" | "up";
}

interface Options {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  align?: "start" | "end";
  matchWidth?: boolean;
  minWidth?: number;
  /** The tallest the panel may be (it scrolls inside beyond this or beyond the room available). */
  maxHeight?: number;
  gap?: number;
  margin?: number;
}

const same = (a: FloatingPosition | null, b: FloatingPosition) =>
  !!a && a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.width === b.width && a.maxHeight === b.maxHeight && a.placement === b.placement;

export function useFloatingPanel({ open, anchorRef, panelRef, align = "start", matchWidth = false, minWidth = 192, maxHeight = 480, gap = 4, margin = 8 }: Options) {
  const [position, setPosition] = useState<FloatingPosition | null>(null);

  const measure = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const available = viewportWidth - margin * 2;
    const width = matchWidth ? Math.min(available, Math.max(anchor.width, minWidth)) : undefined;
    const panelWidth = width ?? Math.min(available, panelRef.current?.offsetWidth ?? minWidth);
    const natural = Math.min(maxHeight, panelRef.current?.scrollHeight ?? 0);

    const below = viewportHeight - anchor.bottom - gap - margin;
    const above = anchor.top - gap - margin;
    const placement: "down" | "up" = natural > below && above > below ? "up" : "down";
    const room = Math.max(96, placement === "down" ? below : above);

    const rawLeft = align === "end" ? anchor.right - panelWidth : anchor.left;
    const left = Math.max(margin, Math.min(rawLeft, viewportWidth - panelWidth - margin));
    const next: FloatingPosition = {
      left,
      width,
      placement,
      maxHeight: Math.min(maxHeight, room),
      ...(placement === "down" ? { top: anchor.bottom + gap } : { bottom: viewportHeight - anchor.top + gap }),
    };
    setPosition((current) => (same(current, next) ? current : next));
  }, [align, anchorRef, gap, margin, matchWidth, maxHeight, minWidth, panelRef]);

  // After every render while open (the list may have changed size), and whenever the page scrolls or resizes.
  useLayoutEffect(() => {
    if (!open) return;
    measure();
  });
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  return position;
}
