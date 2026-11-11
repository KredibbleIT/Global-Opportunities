/**
 * PageHeader: the title block at the top of a page (an optional entity icon tile, the h1, a muted line and an
 * optional action on the right). Same type scale as the list pages' header (page-title / page-subtitle).
 *
 * Props:
 * - title: the page's h1
 * - subtitle: one muted line
 * - icon / tone: an optional IconTile before the title. Entities keep their accent: orange ("brand") for
 *   Opportunities and Programs, purple ("accent") for Partners and Network; the rest use neutral or none.
 * - actions: optional node on the right (a primary button, for example)
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { IconTile, type Tone } from "./IconTile";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  tone?: Tone;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, icon, tone = "accent", actions }: PageHeaderProps) {
  // Unslop pass: from 640px the actions stay on the right however long the subtitle is (flex-wrap used to drop them under it, on the left).
  return (
    <header className="flex flex-col gap-3 min-[640px]:flex-row min-[640px]:items-start min-[640px]:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {icon && <IconTile icon={icon} tone={tone} size="md" />}
        <div className="min-w-0">
          <h1 data-testid="page-title" className="page-title break-words">
            {title}
          </h1>
          {subtitle && <p className="page-subtitle mt-1">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
