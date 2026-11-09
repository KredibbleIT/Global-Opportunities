"use client";

/**
 * EmptyAction: the ONE next step shown inside an empty list (a primary link such as "Add your first ambassador").
 * Pass it as `action` in a page's emptyNoData copy; the page decides who may see it (leave it undefined for a role that cannot add).
 *
 * Props: href, label
 */
import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

export function EmptyAction({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={buttonClasses("primary")}>
      <Plus size={16} strokeWidth={2} aria-hidden="true" />
      {label}
    </Link>
  );
}
