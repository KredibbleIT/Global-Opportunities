/**
 * PageFooter: slim strip at the bottom of a page.
 * Breadcrumb on the left, Help / Terms / Privacy on the right (12px text).
 *
 * Props:
 * - crumbs: breadcrumb labels in order; the last one is the current page
 * Footer link targets live in config/brand.ts (footerLinks): external pages, opened in a new tab.
 */
import { footerLinks } from "@/config/brand";

export function PageFooter({ crumbs }: { crumbs: string[] }) {
  return (
    <footer className="caption flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line pt-5">
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-2">
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            return (
              <li key={crumb} className="flex items-center gap-2" aria-current={isLast ? "page" : undefined}>
                {index > 0 && <span aria-hidden="true">/</span>}
                <span className={isLast ? "font-semibold text-ink" : undefined}>{crumb}</span>
              </li>
            );
          })}
        </ol>
      </nav>
      <ul className="flex items-center gap-5">
        {footerLinks().map((link) => (
          <li key={link.label}>
            <a href={link.href} target="_blank" rel="noopener noreferrer" className="rounded-pill hover:text-ink">
              {link.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </footer>
  );
}
