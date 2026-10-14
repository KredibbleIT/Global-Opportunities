"use client";

/**
 * Dialog: a modal window for a focused task (a form, a wizard, a list). ConfirmDialog is for yes/no questions; use this when
 * the window holds content of its own. Structure and accessibility ideas come from the 21st.dev "Modal" and "Dialog"
 * candidates (focus trapping, scroll lock, Escape and backdrop dismissal, title / description / footer slots), restyled to the
 * brief (white, 16px radius, menu shadow).
 *
 * Behaviour
 * - role="dialog" aria-modal, labelled by its title and described by its description.
 * - Focus moves into the dialog when it opens (to the first control, or to an element marked data-autofocus), stays inside
 *   while Tab is pressed (Shift+Tab wraps too) and returns to whatever opened it when the dialog closes.
 * - Esc closes it (unless `dismissable` is false), and so does a click on the dimmed backdrop.
 * - The page behind does not scroll while it is open.
 * - Phones (below 640px): the dialog is a bottom sheet (full width, anchored to the bottom, rounded on top only).
 * - Toasts never cover the actions: on a phone the footer is registered like a sticky action bar, so the toast stack sits 24px above
 *   the footer's top edge (see Toast and form/action-bar-store). On wider screens the dialog is centred and the toast stays bottom-right.
 * - `focusKey`: when this value changes (for example the current step of a wizard) focus moves to the title, so a keyboard or
 *   screen-reader user is never left on a control that has disappeared.
 *
 * Props: title, description?, onClose, children (the body, scrolls when long), footer? (buttons, kept visible below the body),
 *        size ("md" | "lg" | "xl"), dismissable? (default true), focusKey?, testId?, headerExtra? (shown under the title).
 */
import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/use-media-query";
import { registerActionBar } from "./form/action-bar-store";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SIZES = { md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-5xl" } as const;

interface DialogProps {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZES;
  dismissable?: boolean;
  focusKey?: unknown;
  testId?: string;
  headerExtra?: ReactNode;
}

export function Dialog({ title, description, onClose, children, footer, size = "lg", dismissable = true, focusKey, testId, headerExtra }: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const phone = useMediaQuery("(max-width: 639px)");
  // On a phone the footer plays the part of the sticky action bar, so toasts clear it.
  const footerRef = useCallback(
    (element: HTMLElement | null) => {
      registerActionBar(phone ? element : null);
    },
    [phone],
  );
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Open: remember what had focus, lock page scroll, focus the first control. Close: undo all three.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? titleRef.current)?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  // A new step: focus the title (skipped on the first render, where the effect above has already placed focus).
  const firstKey = useRef(focusKey);
  useEffect(() => {
    if (Object.is(firstKey.current, focusKey)) return;
    firstKey.current = focusKey;
    titleRef.current?.focus();
  }, [focusKey]);

  // Esc closes; Tab is trapped.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissable) {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = !!panelRef.current?.contains(active);
      if (event.shiftKey && (active === first || active === titleRef.current || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [dismissable]);

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-ink/40 p-4 max-sm:items-end max-sm:p-0"
      onMouseDown={(event) => dismissable && event.target === event.currentTarget && closeRef.current()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        data-testid={testId}
        className={cn(
          "flex max-h-[90vh] w-full flex-col rounded-card border border-line bg-surface shadow-pop",
          "max-sm:max-h-[92vh] max-sm:rounded-b-none",
          SIZES[size],
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4 max-sm:px-4">
          <div className="min-w-0">
            <h2 ref={titleRef} id={titleId} tabIndex={-1} className="card-title outline-none">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="page-subtitle mt-1">
                {description}
              </div>
            )}
            {headerExtra}
          </div>
          {dismissable && (
            <button
              type="button"
              onClick={() => closeRef.current()}
              aria-label={`Close ${title}`}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-control text-ink transition-colors duration-150 hover:bg-neutral-soft"
            >
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 max-sm:px-4">{children}</div>
        {footer && <footer ref={footerRef} data-testid="dialog-footer" className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-6 py-4 max-sm:px-4">{footer}</footer>}
      </div>
    </div>
  );
}
