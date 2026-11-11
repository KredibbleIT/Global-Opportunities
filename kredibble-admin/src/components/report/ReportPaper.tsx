/**
 * ReportPaper: the A4-proportioned sheet both report templates are printed on, with the header (eyebrow, title, month, the orange-to-purple rule) and the
 * footer. Only the paper prints: the controls (tabs, month selector, Download PDF) are outside it and hidden in print (globals.css, "monthly report").
 * Below 640px it fills the width with 16px padding and its grids reflow.
 *
 * Props:
 * - title: "Progress report" (partner) or "Team report"
 * - month: the report month ("2026-09"); toDate: it is the current month, so the header says "Month to date"
 * - sample: the figures are sample data. The title gets a "Sample report" badge and the footer says the figures are not the Desk's records; both are
 *   inside the paper, so they print too. False only for figures read from the live API (lib/services/report.ts, reportSource).
 * - note: one line under the month ("Internal. Not for partners.")
 * - children: the sections
 */
import type { ReactNode } from "react";
import { formatMonth } from "@/lib/format";
import type { MonthKey } from "@/lib/mock-entities";

export function ReportPaper({ title, month, toDate = false, sample, note, children, testId }: { title: string; month: MonthKey; toDate?: boolean; sample: boolean; note?: string; children: ReactNode; testId: string }) {
  return (
    <article data-testid={testId} data-source={sample ? "sample" : "live"} aria-label={sample ? `${title} (sample report)` : title} className="report-paper p-4 min-[640px]:p-10">
      <header>
        <p className="text-sm font-medium text-orange-700">Global Opportunity Desk</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 data-testid="report-title" className="font-display text-3xl font-semibold leading-9 text-ink">
            {title}
          </h2>
          {sample && (
            // Inside the paper, so it prints: a sample report must never pass for the Desk's records once it is a PDF (November 2026 review).
            <span data-testid="sample-report-badge" className="badge-text inline-flex w-fit items-center gap-2 rounded-pill bg-warning-soft px-3 py-1 text-warning">
              <span aria-hidden="true" className="size-2 rounded-full bg-warning-dot" />
              Sample report
            </span>
          )}
        </div>
        <p data-testid="report-month" className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-ink">
          {formatMonth(month)}
          {toDate && (
            <span data-testid="month-to-date" className="rounded-pill bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
              Month to date
            </span>
          )}
        </p>
        {note && (
          <p data-testid="report-note" className="caption mt-1">
            {note}
          </p>
        )}
        <div aria-hidden="true" className="mt-4 h-1 rounded-pill bg-linear-to-r from-orange-500 to-purple-600" />
      </header>
      <div className="mt-6 space-y-8 print:mt-4 print:space-y-4">{children}</div>
      <footer className="report-footer mt-10 border-t border-line pt-4 print:mt-4 print:pt-2">
        <p data-testid="report-footer" className="caption text-ink">
          Global Opportunity Desk · {formatMonth(month)}
        </p>
        <p data-testid="report-source" className="caption">
          {sample ? "Sample figures for layout and review. Not the Desk's records." : "Figures from the Desk's own records."}
        </p>
      </footer>
    </article>
  );
}

/** One titled section of the paper (never split across two printed pages). */
/** One titled section. In print it is never split across two pages (it moves whole to the next page instead). */
export function ReportSection({ title, subtitle, children, testId }: { title: string; subtitle?: string; children: ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} aria-label={title} className="report-section">
      <h3 className="font-display text-lg font-semibold leading-6 text-ink">{title}</h3>
      {subtitle && <p className="caption mt-1">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
