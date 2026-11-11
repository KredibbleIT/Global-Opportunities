"use client";

/**
 * OverviewHeader: the page title with the selected month beside it ("Overview · November 2026"), a short subtitle and the orange
 * primary "View report" button. (The month selector sits beside the "Team performance" heading on the page.) "View report" opens the
 * Partner report of the SELECTED month (/monthly-report/partner?month=...) and is not rendered for a role that cannot view the
 * Monthly report.
 *
 * Unslop pass (2026-11-11): the title names the context instead of greeting the person ("Good afternoon, Ama." with a period); the
 * month follows the selector, so the title always says which month the figures below are for.
 *
 * Stacks vertically below 1024px.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { useRoles } from "@/components/access/RoleProvider";
import { formatMonth } from "@/lib/format";
import { useMonth } from "@/lib/use-month";

export function OverviewHeader() {
  const { can } = useRoles();
  const { month } = useMonth();

  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 data-testid="page-title" className="hero-title">
          Overview <span className="font-medium text-muted">· {formatMonth(month)}</span>
        </h1>
        <p className="page-subtitle mt-1">See how your team is doing against its monthly targets</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {can("monthly_report", "view") && (
          <Link href={`/monthly-report/partner?month=${month}`} className={buttonClasses("primary")}>
            View report
            <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        )}
      </div>
    </header>
  );
}
