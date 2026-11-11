"use client";

/**
 * useScrollFade: for a list that scrolls inside a card of fixed size (Priorities after "See all", Recent activity beside the programs
 * table). While there is more below, the bottom 32px fade out, which says "this scrolls" without a scrollbar-only cue; at the end of
 * the list the fade goes, so the last row reads in full.
 *
 * Returns a callback ref (attach) for the scrolling element (the element itself is kept in state, so render code never reads a ref), the element,
 * its onScroll handler and the style that carries the fade (a mask, so it works on any background). It re-checks on scroll, on resize
 * and whenever `deps` change (the rows shown).
 */
import { useCallback, useLayoutEffect, useState, type CSSProperties, type DependencyList } from "react";

const FADE = "linear-gradient(to bottom, black calc(100% - 32px), transparent)";

export interface ScrollFade<T extends HTMLElement> {
  /** The callback ref (named attach: the React Compiler treats a `ref` key as a ref object and forbids reading the rest in render). */
  attach: (element: T | null) => void;
  element: T | null;
  onScroll: () => void;
  style: CSSProperties;
}

/** Fade the bottom of a scrolling element while more content is below. */
export function useScrollFade<T extends HTMLElement>(deps: DependencyList = []): ScrollFade<T> {
  const [element, setElement] = useState<T | null>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  const onScroll = useCallback(() => {
    setMoreBelow(!!element && element.scrollHeight - element.scrollTop - element.clientHeight > 4);
  }, [element]);

  useLayoutEffect(() => {
    if (!element) return;
    // Checked on the next frame (the rows just changed) and on every resize, never synchronously inside the effect.
    const frame = requestAnimationFrame(onScroll);
    const observer = new ResizeObserver(onScroll);
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // The caller's deps say when the content changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element, onScroll, ...deps]);

  return { attach: setElement, element, onScroll, style: moreBelow ? { maskImage: FADE, WebkitMaskImage: FADE } : {} };
}
