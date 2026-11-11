/**
 * ListPage: the page frame shared by every list page.
 *
 *   header   title and subtitle on the left, an optional primary action on the right
 *   toolbar  (16px below) search / filters, passed in as <TableToolbar />
 *   content  (16px below) the table card, passed in as <DataTable />
 *
 * Pages hand it a title, subtitle, optional action and their toolbar + table.
 * They never write page chrome themselves, so every list has the same spacing:
 * one h1 per page, 16px between blocks.
 *
 * Props:
 * - title: the h1 (Jakarta 700 24/30; 22/28 below 640px)
 * - subtitle: one muted line, including the live-count text ("5 seeker accounts registered...")
 * - action: optional { label, href, icon } rendered as the orange primary button, beside the heading
 * - actions: optional node instead of `action` (a button that opens a dialog); the page's ONE primary action, beside the heading
 * - toolbar: optional node (usually <TableToolbar />)
 * - children: the table
 */
import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";

interface ListPageProps {
  title: string;
  subtitle: string;
  action?: { label: string; href: string; icon?: LucideIcon };
  actions?: ReactNode;
  toolbar?: ReactNode;
  /** Shown between the header and the toolbar: the "sample data" notice of a page that is not connected to the API yet (NotConnectedNotice). */
  notice?: ReactNode;
  children: ReactNode;
}

export function ListPage({ title, subtitle, action, actions, toolbar, notice, children }: ListPageProps) {
  const ActionIcon = action?.icon;

  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          actions ??
          (action && (
            <Link href={action.href} className={buttonClasses("primary")}>
              {ActionIcon && <ActionIcon size={16} strokeWidth={1.75} aria-hidden="true" />}
              {action.label}
            </Link>
          ))
        }
      />

      {notice}
      {toolbar}
      {children}
    </div>
  );
}
