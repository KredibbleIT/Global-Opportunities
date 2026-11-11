"use client";

/**
 * EmptyAction: the ONE next step shown inside an empty list (a link such as "Add your first ambassador"). Secondary since the unslop
 * pass: the page header already has the orange primary for the same action, and a screen has one primary.
 * Pass it as `action` in a page's emptyNoData copy; the page decides who may see it (leave it undefined for a role that cannot add).
 *
 * Props: href, label
 */
import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

export function EmptyAction({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={buttonClasses("secondary")}>
      <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
      {label}
    </Link>
  );
}
